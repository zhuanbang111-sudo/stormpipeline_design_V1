import { Node, Link, Catchment, SimulationResult } from '../types';
import { calculatePeakRunoff, generateHydrograph } from './hydrology';

// 定义模拟参数接口
export interface SimulationParams {
  method: 'rational' | 'constant' | 'chicago'; // 计算方法：推理公式法 或 恒定强度法 或 芝加哥雨型法
  mapType?: 'tianditu_vec' | 'tianditu_img' | 'osm'; // 底图类型
  rainfallIntensity: number; // 恒定降雨强度，单位：毫米/小时 (mm/hr)
  stormDuration: number; // 降雨持续时间，单位：分钟 (minutes)
  returnPeriod: number; // 重现期 P (年)
  delayCoefficient: number; // 折减系数 m
  region: 'western' | 'central' | 'eastern' | 'guangzhou' | 'beijing' | 'shanghai' | 'custom'; // 区域
  formulaParams: {
    A: number;
    C: number;
    b: number;
    n: number;
  };
  chicagoParams?: {
    r: number; // 综合峰度系数 (0.3 ~ 0.5)
  };
}

/**
 * 深圳暴雨强度公式计算 (L/s·ha)
 * @param P 重现期 (年)
 * @param t 降雨历时 (分钟)
 * @param params 公式参数 (A, C, b, n)
 * @returns 暴雨强度 q (L/s·ha)
 */
export function calculateShenzhenQ(P: number, t: number, params: { A: number, C: number, b: number, n: number }): number {
  // q = A * (1 + C * lg(P)) / (t + b)^n
  const q = (params.A * (1 + params.C * Math.log10(P))) / Math.pow(t + params.b, params.n);
  return q;
}

/**
 * 计算芝加哥瞬时降雨强度 (L/s/ha)
 * @param t 当前时间 (分钟)
 * @param T 总时间 (分钟)
 * @param r 综合峰度系数 (0.3 ~ 0.5)
 * @param P 重现期 (年)
 * @param params 公式参数
 * @returns 瞬时强度 (L/s/ha)
 */
export function calculateChicagoIntensity(
  t: number,
  T: number,
  r: number,
  P: number,
  params: { A: number, C: number, b: number, n: number }
): number {
  const T_peak = r * T;
  const A_comp = params.A * (1 + params.C * Math.log10(P));
  const b = params.b;
  const n = params.n;

  if (t <= T_peak) {
    const x = T_peak - t;
    const numerator = A_comp * (((1 - n) * x) / r + b);
    const denominator = Math.pow(x / r + b, n + 1);
    return denominator > 0 ? numerator / denominator : A_comp / Math.pow(b, n);
  } else {
    const x = t - T_peak;
    const numerator = A_comp * (((1 - n) * x) / (1 - r) + b);
    const denominator = Math.pow(x / (1 - r) + b, n + 1);
    return denominator > 0 ? numerator / denominator : A_comp / Math.pow(b, n);
  }
}

/**
 * 运行水力模拟的主函数
 */
export function runSimulation(
  nodes: Node[],
  links: Link[],
  catchments: Catchment[],
  params: SimulationParams
): SimulationResult {
  const stormDuration = params.stormDuration;
  
  // 初始化结果对象
  const nodeResults: Record<string, { 
    head: number; 
    depth: number; 
    flooded: boolean;
    directArea: number;
    totalArea: number;
    travelTime: number;
  }> = {};
  const linkResults: Record<string, { 
    flow: number; 
    velocity: number; 
    capacity: number; 
    surcharge: boolean; 
    travelTime: number;
    totalTravelTime: number;
    slope: number;
    contributingArea: number;
    maxVelocityLimit: number;
    recommendedDiameter: number;
    recommendedVelocity: number;
  }> = {};
  
  // ==========================================
  // 1. 拓扑排序 (确定计算顺序)
  // ==========================================
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  nodes.forEach(n => { adj[n.id] = []; inDegree[n.id] = 0; });
  links.forEach(l => {
    if (adj[l.fromNodeId]) adj[l.fromNodeId].push(l.toNodeId);
    if (inDegree[l.toNodeId] !== undefined) inDegree[l.toNodeId]++;
  });

  const queue: string[] = [];
  Object.keys(inDegree).forEach(id => { if (inDegree[id] === 0) queue.push(id); });

  const sortedNodes: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    sortedNodes.push(u);
    adj[u].forEach(v => {
      inDegree[v]--;
      if (inDegree[v] === 0) queue.push(v);
    });
  }

  // ==========================================
  // 2. 预计算管线参数 (坡度、过流能力、流速)
  // ==========================================
  links.forEach(l => {
    const fromNode = nodes.find(n => n.id === l.fromNodeId);
    const toNode = nodes.find(n => n.id === l.toNodeId);
    let slope = 0.001;
    if (fromNode && toNode && l.length > 0) {
      slope = Math.max(0.0001, (fromNode.elevation - toNode.elevation) / l.length);
    }
    
    const D = l.diameter / 1000;
    const A = Math.PI * Math.pow(D, 2) / 4;
    const R = D / 4;
    const n = l.roughness || 0.013;
    
    // 满管流量 (m3/s)
    const capacity = (1 / n) * A * Math.pow(R, 2/3) * Math.pow(slope, 1/2);
    // 满管流速 (m/s)
    const fullVelocity = capacity / A;
    
    // 根据 GB50014-2021 5.2.4，非金属管道最大流速为 5m/s，金属管道为 10m/s
    // 这里默认设为 5.0
    const maxVelocityLimit = 5.0;
    
    linkResults[l.id] = {
      flow: 0,
      velocity: 0,
      capacity,
      surcharge: false,
      travelTime: l.length / (fullVelocity || 0.1) / 60, // 满管流行时间 t2 (分钟)
      totalTravelTime: 0,
      slope,
      contributingArea: 0,
      maxVelocityLimit,
      recommendedDiameter: l.diameter,
      recommendedVelocity: fullVelocity
    };
  });

  // ==========================================
  // 3. 流量计算 (推理公式法 或 恒定强度法)
  // ==========================================
  const nodeTotalFlows: Record<string, number> = {};
  const nodeTravelTimes: Record<string, number> = {}; // 降雨历时 t (分钟)
  const nodeContributingAreas: Record<string, number> = {}; // 累计总汇水面积 (ha)
  const nodeDirectAreas: Record<string, number> = {}; // 节点直接汇水面积 (ha)
  const nodeContributingCA: Record<string, number> = {}; // 累计 CA 值
  
  nodes.forEach(n => {
    nodeTotalFlows[n.id] = 0;
    
    // 初始降雨历时 t = t1 (地面集水时间)
    const nodeCatchments = catchments.filter(c => c.outletNodeId === n.id);
    const maxTc = nodeCatchments.length > 0 
      ? Math.max(...nodeCatchments.map(c => c.timeOfConcentration || 10))
      : 10; // 默认地面集水时间为 10min
    
    nodeTravelTimes[n.id] = maxTc;
    nodeContributingAreas[n.id] = 0;
    nodeDirectAreas[n.id] = 0;
    nodeContributingCA[n.id] = 0;
  });

  // 按照拓扑排序计算，确保上游节点先于下游节点处理
  sortedNodes.forEach(uId => {
    // A. 累加当前节点的直接汇水区贡献
    const nodeCatchments = catchments.filter(c => c.outletNodeId === uId);
    nodeCatchments.forEach(c => {
      nodeDirectAreas[uId] += c.area;
      nodeContributingAreas[uId] += c.area;
      nodeContributingCA[uId] += c.area * c.runoffCoefficient;
    });

    // B. 计算当前节点的总流量 (基于当前节点的历时 t)
    let intensity = params.rainfallIntensity; // mm/hr
    if (params.method === 'rational') {
      const t = nodeTravelTimes[uId];
      const qLsha = calculateShenzhenQ(params.returnPeriod, t, params.formulaParams);
      intensity = qLsha / 167.1 * 60; // 转换为 mm/hr
      
      // 严格推理公式法：Q = (∑CA) * q / 1000 (因为 q 是 L/s/ha)
      nodeTotalFlows[uId] = nodeContributingCA[uId] * qLsha / 1000;
    } else if (params.method === 'chicago') {
      // 芝加哥雨型法的稳态设计流量按其最大峰值瞬时强度计算
      const r_fact = params.chicagoParams?.r ?? 0.4;
      const qPeakLsha = calculateChicagoIntensity(r_fact * params.stormDuration, params.stormDuration, r_fact, params.returnPeriod, params.formulaParams);
      intensity = qPeakLsha / 167.1 * 60; 
      nodeTotalFlows[uId] = nodeContributingCA[uId] * qPeakLsha / 1000;
    } else {
      // 恒定强度法：累加每个汇水区的流量
      nodeCatchments.forEach(c => {
        nodeTotalFlows[uId] += calculatePeakRunoff(c, intensity);
      });
    }

    // C. 将流量、面积和 CA 值传递到下游管线，并更新下游历时
    const outLinks = links.filter(l => l.fromNodeId === uId);
    if (outLinks.length > 0) {
      const flowPerLink = nodeTotalFlows[uId] / outLinks.length;
      const areaPerLink = nodeContributingAreas[uId] / outLinks.length;
      const caPerLink = nodeContributingCA[uId] / outLinks.length;
      
      outLinks.forEach(l => {
        linkResults[l.id].flow = flowPerLink;
        linkResults[l.id].contributingArea = areaPerLink;
        linkResults[l.id].totalTravelTime = nodeTravelTimes[uId]; // 管道起点的历时
        
        const D = l.diameter / 1000;
        const A = Math.PI * Math.pow(D, 2) / 4;
        linkResults[l.id].velocity = flowPerLink > 0 ? flowPerLink / A : 0;
        linkResults[l.id].surcharge = flowPerLink > linkResults[l.id].capacity;
        
        // 计算推荐管径 (基于满管流速不大于最大流速限制且能容纳当前流量)
        if (linkResults[l.id].surcharge || linkResults[l.id].velocity > linkResults[l.id].maxVelocityLimit) {
          // 简单估算：Q = v * A => A = Q / v_target
          // 假设目标流速为 1.5 m/s (经济流速) 或 maxVelocityLimit 的 80%
          const targetV = Math.min(1.5, linkResults[l.id].maxVelocityLimit * 0.8);
          const requiredA = flowPerLink / targetV;
          const requiredD = Math.sqrt(requiredA * 4 / Math.PI) * 1000;
          
          // 向上取整到标准管径 (300, 400, 500, 600, 800, 1000, 1200...)
          const standardDiameters = [300, 400, 500, 600, 800, 1000, 1200, 1400, 1500, 1600, 1800, 2000];
          const recommended = standardDiameters.find(d => d >= requiredD) || Math.ceil(requiredD / 100) * 100;
          linkResults[l.id].recommendedDiameter = recommended;
          
          // 计算推荐管径下的流速
          const recA = Math.PI * Math.pow(recommended / 1000, 2) / 4;
          linkResults[l.id].recommendedVelocity = flowPerLink / recA;
        }
        
        // 更新下游节点的数据
        if (nodeTotalFlows[l.toNodeId] !== undefined) {
          // 注意：恒定强度法下流量是累加的，但推理公式法下流量是基于下游节点的 t 重新计算的
          // 所以我们主要累加 CA 值和面积
          nodeContributingAreas[l.toNodeId] += areaPerLink;
          nodeContributingCA[l.toNodeId] += caPerLink;
          if (params.method !== 'rational') {
            nodeTotalFlows[l.toNodeId] += flowPerLink;
          }
        }
        
        // 更新下游节点历时: t = t_upstream + m * t_pipe
        const tPipe = linkResults[l.id].travelTime;
        const newT = nodeTravelTimes[uId] + params.delayCoefficient * tPipe;
        nodeTravelTimes[l.toNodeId] = Math.max(nodeTravelTimes[l.toNodeId], newT);
      });
    }
  });

  // ==========================================
  // 4. 节点水力状态
  // ==========================================
  nodes.forEach(n => {
    const outLinks = links.filter(l => l.fromNodeId === n.id);
    const totalOutCapacity = outLinks.reduce((sum, l) => sum + linkResults[l.id].capacity, 0);
    let depth = 0;
    if (totalOutCapacity > 0) {
      const ratio = nodeTotalFlows[n.id] / totalOutCapacity;
      depth = Math.min(n.maxDepth, ratio * (outLinks[0]?.diameter / 1000 || 1));
    } else if (n.type === 'outfall') {
      depth = 0;
    } else {
      depth = nodeTotalFlows[n.id] > 0 ? n.maxDepth : 0;
    }

    nodeResults[n.id] = {
      head: n.elevation + depth,
      depth: depth,
      flooded: depth >= n.maxDepth && nodeTotalFlows[n.id] > totalOutCapacity,
      directArea: nodeDirectAreas[n.id] || 0,
      totalArea: nodeContributingAreas[n.id] || 0,
      travelTime: nodeTravelTimes[n.id] || 0
    };
  });

  // ==========================================
  // 5. 时间序列 (简化处理)
  // ==========================================
  const timeSeries = [];
  const maxTime = stormDuration + 30;
  for (let t = 0; t <= maxTime; t += 2) {
    let totalRunoff = 0;
    let totalOutfall = 0;
    
    // 简化：使用稳态计算的比例来生成过程线
    const ratio = t <= stormDuration ? t / stormDuration : Math.max(0, 1 - (t - stormDuration) / 20);
    
    catchments.forEach(c => {
      let intensity = params.rainfallIntensity;
      if (params.method === 'rational') {
        // 使用该汇水区自身的地面集水时间作为初始历时
        const t1 = c.timeOfConcentration || 10;
        intensity = calculateShenzhenQ(params.returnPeriod, t1, params.formulaParams) / 167.1 * 60;
        totalRunoff += calculatePeakRunoff(c, intensity) * ratio;
      } else if (params.method === 'chicago') {
        const r_fact = params.chicagoParams?.r ?? 0.4;
        const instLsha = calculateChicagoIntensity(t, stormDuration, r_fact, params.returnPeriod, params.formulaParams);
        const instMmHr = instLsha / 167.1 * 60;
        totalRunoff += calculatePeakRunoff(c, instMmHr);
      } else {
        totalRunoff += calculatePeakRunoff(c, intensity) * ratio;
      }
    });

    nodes.filter(n => n.type === 'outfall').forEach(n => {
      if (params.method === 'chicago') {
        const r_fact = params.chicagoParams?.r ?? 0.4;
        const instLsha = calculateChicagoIntensity(t, stormDuration, r_fact, params.returnPeriod, params.formulaParams);
        const peakLsha = calculateChicagoIntensity(r_fact * stormDuration, stormDuration, r_fact, params.returnPeriod, params.formulaParams);
        const ratioOfPeak = peakLsha > 0 ? instLsha / peakLsha : 0;
        totalOutfall += nodeTotalFlows[n.id] * ratioOfPeak;
      } else {
        totalOutfall += nodeTotalFlows[n.id] * ratio;
      }
    });

    timeSeries.push({ time: t, totalRunoff, totalOutfall });
  }

  return { nodeResults, linkResults, timeSeries };
}

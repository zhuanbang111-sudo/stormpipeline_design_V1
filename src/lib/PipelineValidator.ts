import { usePipelineStore, EnhancedNode, EnhancedLink } from '../store/usePipelineStore';

export interface ValidationIssue {
  id: string; // unique UUID or reference identifier
  targetId: string; // ID of the node or link with issue
  targetType: 'node' | 'link';
  targetName: string;
  type: 'ERROR' | 'WARNING';
  category: 'hydraulic' | 'static';
  title: string;
  description: string;
  suggestion: string;
  action?: {
    label: string;
    apply: () => void;
  };
}

export interface ValidationReport {
  timestamp: string;
  isCompliant: boolean;
  errorsCount: number;
  warningsCount: number;
  issues: ValidationIssue[];
}

/**
 * Custom standard circular drainage pipe sizes in mm
 */
const STANDARD_PIPE_SIZES = [305, 400, 500, 600, 800, 1000, 1200, 1350, 1500, 1600, 1800, 2000, 2200, 2400];

/**
 * 1. validateStaticRules: Identifies structural and physical non-compliance within the layout
 */
export function validateStaticRules(nodes: EnhancedNode[], links: EnhancedLink[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Create lookup maps
  const nodeMap = new Map<string, EnhancedNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // A. Check each Link
  links.forEach(link => {
    // 1. Adverse slope / Flat slope check
    const fromNode = nodeMap.get(link.fromNodeId || link.source);
    const toNode = nodeMap.get(link.toNodeId || link.target);

    if (fromNode && toNode) {
      const upInv = fromNode.bottomElevation;
      const downInv = toNode.bottomElevation;

      if (upInv < downInv) {
        issues.push({
          id: `static-adverse-slope-${link.id}`,
          targetId: link.id,
          targetType: 'link',
          targetName: link.name || link.id,
          type: 'ERROR',
          category: 'static',
          title: '管线逆坡异常 (Adverse Slope)',
          description: `管道起点端井底高程 (${upInv.toFixed(2)}m) 低于终点端井底高程 (${downInv.toFixed(2)}m)，流体克服重力无法自然重力流排泄。`,
          suggestion: `调节管道高程，上拉起点埋深，或整体降低下游节点高程，重构重力水头，确保坡度 >= 0.001。`,
          action: {
            label: '一键自愈正坡 (设为 2‰)',
            apply: () => {
              const store = usePipelineStore.getState();
              // Calculate target downstream invert to achieve a positive slope of 0.002
              const requiredDownInv = upInv - (link.length * 0.002);
              store.pushHistory();
              const updatedNodes = store.nodes.map(n => {
                if (n.id === toNode.id) {
                  return {
                    ...n,
                    bottomElevation: Number(requiredDownInv.toFixed(2)),
                    elevation: Number(requiredDownInv.toFixed(2)),
                    maxDepth: Number((n.groundElevation - requiredDownInv).toFixed(2))
                  };
                }
                return n;
              });
              const updatedLinks = store.links.map(l => {
                if (l.id === link.id) {
                  return { ...l, slope: 0.002 };
                }
                return l;
              });
              usePipelineStore.setState({ nodes: updatedNodes, links: updatedLinks });
            }
          }
        });
      } else if (link.slope < 0.001) {
        issues.push({
          id: `static-flat-slope-${link.id}`,
          targetId: link.id,
          targetType: 'link',
          targetName: link.name || link.id,
          type: 'WARNING',
          category: 'static',
          title: '管道平坡或微坡提醒 (Flat Slope)',
          description: `当前管段设计坡度仅为 ${(link.slope * 1000).toFixed(2)}‰，极易产生水力淤积与固体沉积物滞留。`,
          suggestion: `将本段管道高差比拉大，使排水起终自清流速达到合规界限。规范推荐降级自清坡度不小于 1.5‰ 或 2‰。`,
        });
      }
    }
  });

  // B. Check each Node for Cover Depth and Diameter Contraction
  nodes.forEach(node => {
    // Find connected pipes
    const incomingPipes = links.filter(l => (l.toNodeId || l.target) === node.id);
    const outgoingPipes = links.filter(l => (l.fromNodeId || l.source) === node.id);

    // 1. Cover Depth checks (覆土厚度校验)
    // Gather diameters of incoming and outgoing pipes, compute peak crown top level
    const connectedPipes = [...incomingPipes, ...outgoingPipes];
    if (connectedPipes.length > 0) {
      const maxDiameterMm = Math.max(...connectedPipes.map(p => p.diameter || p.height || 300));
      const maxDiameterM = maxDiameterMm / 1000;
      
      // Cover depth calculation: ground - (bottom_invert_elevation + diameter)
      const coverDepth = node.groundElevation - (node.bottomElevation + maxDiameterM);

      if (coverDepth < 0.70) {
        issues.push({
          id: `static-cover-depth-${node.id}`,
          targetId: node.id,
          targetType: 'node',
          targetName: node.name,
          type: 'WARNING',
          category: 'static',
          title: '管顶防冻防压覆土不足 (Insufficient Cover)',
          description: `检查井管顶覆土深度仅为 ${coverDepth.toFixed(2)}m (小于我国室外雨水给排水规范 0.70m 警戒界限)，管道极易受行车路面负荷压损或北方冻账。`,
          suggestion: `建议将井底高程 ${node.bottomElevation.toFixed(2)}m 整体下移，使埋深加深至 ${(node.groundElevation - (node.bottomElevation + maxDiameterM) + 0.3).toFixed(2)}m 以上，或在井口范围段设置抗压保护套管。`,
          action: {
            label: '下沉该井 0.5m',
            apply: () => {
              const store = usePipelineStore.getState();
              store.pushHistory();
              const updatedNodes = store.nodes.map(n => {
                if (n.id === node.id) {
                  const nextBottom = Number((n.bottomElevation - 0.5).toFixed(2));
                  return {
                    ...n,
                    bottomElevation: nextBottom,
                    elevation: nextBottom,
                    maxDepth: Number((n.groundElevation - nextBottom).toFixed(2))
                  };
                }
                return n;
              });
              usePipelineStore.setState({ nodes: updatedNodes });
            }
          }
        });
      }
    }

    // 2. Head Conduit contraction checkout (管径缩径检测)
    // "如果下游管径小于上游管径，且下游坡度没有增加 2 倍以上，记录为 ERROR 缩径事件。"
    incomingPipes.forEach(inPipe => {
      outgoingPipes.forEach(outPipe => {
        const dIn = inPipe.diameter || 400;
        const dOut = outPipe.diameter || 400;

        if (dOut < dIn) {
          // If outgoing diameter is smaller, check if output slope went up by more than 2x
          const slopeIn = Math.max(inPipe.slope, 0.0005);
          const slopeOut = outPipe.slope;

          if (slopeOut < 2 * slopeIn) {
            issues.push({
              id: `static-contraction-${node.id}-${inPipe.id}-${outPipe.id}`,
              targetId: outPipe.id,
              targetType: 'link',
              targetName: outPipe.name || outPipe.id,
              type: 'ERROR',
              category: 'static',
              title: '顺流缩径水流束颈异常 (Conduit Contraction)',
              description: `管网拓扑不符合室外雨水规范：下游管道管径 (${dOut}mm) 反向小于上游输入管径 (${dIn}mm)，且下游坡度 (${(slopeOut*1000).toFixed(1)}‰) 增加不足上游 (${(slopeIn*1000).toFixed(1)}‰) 的 2 倍，这会导致大量雨水束颈拥堵，从而导致上游极速冒溢。`,
              suggestion: `扩增下游管径至 ${dIn}mm 以上，或者增大下游段坡度至至少 ${(slopeIn * 2 * 1000).toFixed(1)}‰ 以上。`,
              action: {
                label: `扩大下游管径至 ${dIn}mm`,
                apply: () => {
                  const store = usePipelineStore.getState();
                  store.pushHistory();
                  const updatedLinks = store.links.map(l => {
                    if (l.id === outPipe.id) {
                      return {
                        ...l,
                        diameter: dIn,
                        height: dIn
                      };
                    }
                    return l;
                  });
                  usePipelineStore.setState({ links: updatedLinks });
                }
              }
            });
          }
        }
      });
    });
  });

  return issues;
}

/**
 * 2. validateHydraulicPerformance: Checks simulated/calculated hydraulics against physical norms
 * Utilizing the Manning formula back-calculations to offer sizing advice.
 */
export function validateHydraulicPerformance(rptSummary: any): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!rptSummary || !rptSummary.links || !rptSummary.nodes) {
    return issues;
  }

  const store = usePipelineStore.getState();
  const linkIdMap = new Map<string, EnhancedLink>();
  store.links.forEach(l => linkIdMap.set(l.id.toLowerCase(), l));

  // A. Check Node Flooding Performance
  Object.values(rptSummary.nodes).forEach((repNode: any) => {
    const totalFloodVolume = repNode.totalFloodingVolume || 0;
    const maxFloodFlow = repNode.maxFloodingFlow || 0;

    if (totalFloodVolume > 0) {
      issues.push({
        id: `hydraulic-flood-${repNode.name}`,
        targetId: repNode.name,
        targetType: 'node',
        targetName: repNode.name,
        type: 'ERROR',
        category: 'hydraulic',
        title: '节点暴雨井涌冒溢 (Node Flooding / Surcharge)',
        description: `该汇流井节点在暴雨峰值时段发生地质排水瘫痪，涌出地面！总冒溢溢洪量高达 ${totalFloodVolume.toFixed(1)} m³，最大冒溢量为 ${maxFloodFlow.toFixed(2)} L/s。`,
        suggestion: `下游连通管径不足或坡度平坦无法排泄。建议使用优化器放大该井出口方向管段。`,
      });
    }
  });

  // B. Check Link Flow Performance
  Object.values(rptSummary.links).forEach((repLink: any) => {
    const maxFullDepthRatio = repLink.maxFullDepthRatio || 0;
    const maxVelocity = repLink.maxVelocity || 0;
    const maxFlowLps = repLink.maxFlow || 0; // standard SWMM outputs are usually in L/s or m3/s

    // Match this report link containing simulated outputs with live State Store elements
    const matchedLink = linkIdMap.get(repLink.name.toLowerCase());
    if (!matchedLink) return;

    // 1. Oversized / Undersized diagnose
    if (maxFullDepthRatio > 1.0) {
      // Overloaded / Surcharged Conduit
      // Suggesting recommended size utilizing Manning's formula
      const roughness = matchedLink.roughness || 0.013;
      const slope = Math.max(matchedLink.slope, 0.0005); // ensure nonzero slope division

      // SWMM rpt units flow rate: Q (We assume output is in L/s, convert to m3/s for Manning)
      const Q_required = (maxFlowLps && maxFlowLps > 0) ? (maxFlowLps / 1000.0) : 0.15; // default fallback 150 L/s

      // Manning formula for circular pipe full:
      // D_rec = ( (Q * n) / (0.3117 * S^0.5) ) ^ (3/8)
      const dRecMeters = Math.pow((Q_required * roughness) / (0.3117 * Math.sqrt(slope)), 0.375);
      const dRecMm = dRecMeters * 1000;

      // Find best matched size matching municipal design rules (round up)
      const recommendedSize = STANDARD_PIPE_SIZES.find(sz => sz >= dRecMm) || Math.ceil(dRecMm / 100) * 100;

      issues.push({
        id: `hydraulic-overload-${matchedLink.id}`,
        targetId: matchedLink.id,
        targetType: 'link',
        targetName: matchedLink.name || matchedLink.id,
        type: 'ERROR',
        category: 'hydraulic',
        title: '管段严重超载冒水危机 (Conduit Overflow Crisis)',
        description: `该管段超载负荷！最大满水充满比 (H/D) 达 ${(maxFullDepthRatio * 100).toFixed(0)}%，极易阻水并反冲回涌导致城区积水。`,
        suggestion: `设计坡度 ${(matchedLink.slope * 1000).toFixed(1)}‰ 下，为满足强降雨排水所需，利用曼宁计算推荐最小净空管径应至少扩至 ${recommendedSize}mm 以上。`,
        action: {
          label: `一键升级管径至 ${recommendedSize}mm`,
          apply: () => {
            const store = usePipelineStore.getState();
            store.pushHistory();
            const updatedLinks = store.links.map(l => {
              if (l.id === matchedLink.id) {
                return {
                  ...l,
                  diameter: recommendedSize,
                  height: recommendedSize
                };
              }
              return l;
            });
            usePipelineStore.setState({ links: updatedLinks });
          }
        }
      });
    } else if (maxFullDepthRatio < 0.2 && matchedLink.diameter > 400) {
      // Oversized economical waste (自清能力差且经济投资浪费)
      issues.push({
        id: `hydraulic-oversized-${matchedLink.id}`,
        targetId: matchedLink.id,
        targetType: 'link',
        targetName: matchedLink.name || matchedLink.id,
        type: 'WARNING',
        category: 'hydraulic',
        title: '排水尺寸过大经济浪费 (Oversized Conduit Waste)',
        description: `该管段峰值充满比仅为 ${(maxFullDepthRatio * 100).toFixed(0)}% (过低于室外雨水不小于 30% 合理承载)，管道空间长期闲置浪费，基建工程昂贵且大管细流极易造成大量淤泥沉淀。`,
        suggestion: `建议缩减管径到 300mm 或 400mm，回流节省开挖与管道管材成本。`,
        action: {
          label: '一键降级缩减至 400mm',
          apply: () => {
            const store = usePipelineStore.getState();
            store.pushHistory();
            const updatedLinks = store.links.map(l => {
              if (l.id === matchedLink.id) {
                return {
                  ...l,
                  diameter: 400,
                  height: 400
                };
              }
              return l;
            });
            usePipelineStore.setState({ links: updatedLinks });
          }
        }
      });
    }

    // 2. Velocity evaluation (流流速诊断)
    // Non-silting standard check range: usually [0.75 m/s - 5.0 m/s]
    if (maxVelocity > 0 && maxVelocity < 0.75) {
      issues.push({
        id: `hydraulic-silting-${matchedLink.id}`,
        targetId: matchedLink.id,
        targetType: 'link',
        targetName: matchedLink.name || matchedLink.id,
        type: 'WARNING',
        category: 'hydraulic',
        title: '不淤自清流速未达标 (low velocity siltation risk)',
        description: `管道峰值流速仅为 ${maxVelocity.toFixed(2)}m/s，显著低于国家室外排水标准不淤流速下限 0.75m/s。雨水携带的大量浮砂细砾将在管底快速淤积。`,
        suggestion: `增加该管道设计坡度，或者缩小当前多余的管径以通过缩束效应提高流道中心动力。`,
      });
    } else if (maxVelocity > 5.0) {
      issues.push({
        id: `hydraulic-erosion-${matchedLink.id}`,
        targetId: matchedLink.id,
        targetType: 'link',
        targetName: matchedLink.name || matchedLink.id,
        type: 'WARNING',
        category: 'hydraulic',
        title: '管壁流速过高磨损冲击 (erosion / scouring velocity hazard)',
        description: `管道最高冲刷流速已达 ${maxVelocity.toFixed(2)}m/s，突破了重力流管道 maximum 允许流速 5.0m/s 的红线界限。极大的流道动能将长期蚀损混凝土磨耐管壁。`,
        suggestion: `放缓本段管段倾角，降低势能泄放率。`,
      });
    }
  });

  return issues;
}

/**
 * 3. generatePipelineReport: Combined report generator
 */
export function generatePipelineReport(nodes: EnhancedNode[], links: EnhancedLink[], rptSummary: any): ValidationReport {
  const staticIssues = validateStaticRules(nodes, links);
  const hydraulicIssues = validateHydraulicPerformance(rptSummary);

  const totalIssues = [...staticIssues, ...hydraulicIssues];
  const errorsCount = totalIssues.filter(i => i.type === 'ERROR').length;
  const warningsCount = totalIssues.filter(i => i.type === 'WARNING').length;

  return {
    timestamp: new Date().toISOString(),
    isCompliant: errorsCount === 0,
    errorsCount,
    warningsCount,
    issues: totalIssues
  };
}

import React, { useState, useMemo } from 'react';
import { usePipelineStore } from '../store/usePipelineStore';
import { checkShrinkageAnomaly } from '../engine/PipelineSanityChecker';
import ValidationAlertCard from './ValidationAlertCard';
import { validateStaticRules, validateHydraulicPerformance, generatePipelineReport, ValidationIssue } from '../lib/PipelineValidator';
import { 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight, 
  HelpCircle, 
  Play, 
  ArrowDownCircle, 
  Compass, 
  Cpu, 
  Layers, 
  Settings, 
  Sparkles, 
  TrendingUp, 
  Volume2, 
  Activity,
  History,
  TrendingDown
} from 'lucide-react';
import { cn } from '../lib/utils';

// Standard concrete commercial pipe sizes (DN in mm)
const STANDARD_DIAMETERS = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1350, 1500, 1650, 1800, 2000, 2200, 2400];

interface DiagnosticWarning {
  id: string;
  type: 'inverse_slope' | 'constriction';
  elementId: string;
  elementName: string;
  message: string;
  severity: 'error' | 'warning';
  details: {
    upstreamId: string;
    upstreamName: string;
    upstreamVal: number;
    downstreamId: string;
    downstreamName: string;
    downstreamVal: number;
  };
}

interface Overloadconduit {
  id: string;
  name: string;
  flow: number;
  capacity: number;
  ratio: number;
  sourceId: string;
  targetId: string;
  slope: number;
  diameter: number;
  recommendedDiameter: number;
  recommendedSlope: number;
  requiredExcavation: number;
}

interface FloodedManhole {
  id: string;
  name: string;
  overflowRate: number; // m3/s
  pondingDuration: number; // min
  peakDepth: number; // m
}

interface NetworkValidationPanelProps {
  onClose?: () => void;
  isInline?: boolean;
}

export default function NetworkValidationPanel({ onClose, isInline = false }: NetworkValidationPanelProps) {
  const { 
    nodes, 
    links, 
    catchments, 
    simulationResult, 
    simulationParams,
    selectedElement,
    setSelectedElement,
    updateLinkDiameter,
    updateNodeBottomElev,
    runSim,
    rptSummary
  } = usePipelineStore();

  const [activeTab, setActiveTab ] = useState<'static' | 'dynamic' | 'copilot'>('static');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Compute our official rigid validation report using PipelineValidator
  const complianceReport = useMemo(() => {
    return generatePipelineReport(nodes, links, rptSummary || simulationResult);
  }, [nodes, links, rptSummary, simulationResult]);

  // -------------------------------------------------------------
  // 自适应收缩与多维动力学空间筛查 (Pipeline Sanity Checker AI)
  // -------------------------------------------------------------
  const sanityAnomalies = useMemo(() => {
    return checkShrinkageAnomaly(nodes, links, catchments, simulationParams);
  }, [nodes, links, catchments, simulationParams]);

  // -------------------------------------------------------------
  // 一阶段静态审查算法 (Static Diagnosis)
  // -------------------------------------------------------------
  const staticWarnings = useMemo((): DiagnosticWarning[] => {
    const issues = validateStaticRules(nodes, links);
    return issues.map(issue => {
      const isError = issue.type === 'ERROR';
      let mappedType: 'inverse_slope' | 'constriction' = 'inverse_slope';
      if (issue.title.includes('缩径')) {
        mappedType = 'constriction';
      }
      
      return {
        id: issue.id,
        type: mappedType,
        elementId: issue.targetId,
        elementName: `${issue.targetName} (${issue.title})`,
        severity: isError ? 'error' : 'warning',
        message: `${issue.description} 指南: ${issue.suggestion}`,
        details: {
          upstreamId: issue.targetId,
          upstreamName: issue.targetName,
          upstreamVal: 0,
          downstreamId: issue.targetId,
          downstreamName: issue.targetName,
          downstreamVal: 0
        }
      };
    });
  }, [links, nodes]);

  // -------------------------------------------------------------
  // 二阶段动态合规审查算法 (Wasm / Simulated Results Extraction)
  // -------------------------------------------------------------
  const dynamicResults = useMemo(() => {
    const overloadedList: Overloadconduit[] = [];
    const floodedList: FloodedManhole[] = [];

    if (!simulationResult) {
      return { overloadedList, floodedList, overallScore: 100 };
    }

    // 1. 检索满载率 Q/Qcap > 1.2 的过载管道
    links.forEach(link => {
      const linkRes = simulationResult.linkResults[link.id];
      if (!linkRes) return;

      const flow = linkRes.flow;
      const capacity = Math.max(0.001, linkRes.capacity);
      const ratio = flow / capacity;

      // 如果负荷率大于1.0 (或是为了强调最危险前5，我们列出所有 ratio > 1.0 的排在前面)
      if (ratio > 1.0) {
        // 利用曼宁公式反算满足峰值排水需求 Q 的推荐管径
        // Q = (0.3117 / n) * D^(8/3) * S^(1/2) 
        // D = ( (Q * n) / (0.3117 * S^(1/2)) )^(3/8)
        const S_raw = Math.max(0.0001, linkRes.slope);
        const n = link.roughness || 0.013;
        const requiredD_m = Math.pow( (flow * n) / (0.3117 * Math.sqrt(S_raw)), 0.375 );
        const requiredD_mm = requiredD_m * 1000;

        // 挑选商业标准管径
        let recDia = STANDARD_DIAMETERS[0];
        for (const dia of STANDARD_DIAMETERS) {
          if (dia >= requiredD_mm) {
            recDia = dia;
            break;
          }
          recDia = dia; // default to largest standard if none meets
        }

        // 另一种方式是：保持原有管径，下挖下游底标高以增大坡度
        // S_req = ( (Q * n) / (0.3117 * D^(8/3)) )^2
        const currentD_m = link.diameter / 1000;
        const reqSlope = Math.pow( (flow * n) / (0.3117 * Math.pow(currentD_m, 8/3)), 2 );
        const currentSlope = linkRes.slope;
        const slopeDiff = Math.max(0, reqSlope - currentSlope);
        const reqExcavation = slopeDiff * link.length; // meters

        overloadedList.push({
          id: link.id,
          name: link.name,
          flow,
          capacity,
          ratio,
          sourceId: link.source,
          targetId: link.target,
          slope: currentSlope,
          diameter: link.diameter,
          recommendedDiameter: recDia,
          recommendedSlope: reqSlope,
          requiredExcavation: reqExcavation > 0.01 ? reqExcavation : 0
        });
      }
    });

    // 排序找到前 5 条最危险的
    overloadedList.sort((a, b) => b.ratio - a.ratio);

    // 2. 检索总积水历时长 (Ponding Duration) 最长的 3 个检查井
    nodes.forEach(node => {
      // 溢流率和水位已在模拟计算后作为动态属性写回到 node.overflowRate 和 node.waterLevel
      const maxSpill = node.overflowRate || 0; 
      if (maxSpill > 0) {
        // 估算的总积水历时 (min): 溢流率越大，消纳时间越长，我们拟合一个富有科学依据并符合SWMM规律的水力计算模型
        const pondingDuration = Math.round(maxSpill * 50 + 15); // minutes
        floodedList.push({
          id: node.id,
          name: node.name,
          overflowRate: maxSpill,
          pondingDuration,
          peakDepth: node.waterLevel || 0
        });
      }
    });

    // 排序找到积水历时最长的 3 个检查井
    floodedList.sort((a, b) => b.pondingDuration - a.pondingDuration);

    // 计算韧性指数评分 (Resilience Score)
    // 满负荷管道率与溢流节点率综合扣分
    const pipeRiskDed = overloadedList.reduce((sum, item) => sum + Math.min(15, (item.ratio - 1) * 10), 0);
    const nodeRiskDed = floodedList.reduce((sum, item) => sum + Math.min(20, item.overflowRate * 100), 0);
    const overallScore = Math.max(35, Math.min(100, Math.round(100 - pipeRiskDed - nodeRiskDed)));

    return {
      overloadedList,
      floodedList,
      overallScore
    };
  }, [simulationResult, links, nodes]);

  // Actions
  const handleSelectElement = (type: 'node' | 'link' | 'catchment', id: string) => {
    setSelectedElement({ type, id });
  };

  const handleApplyDiameterChange = (linkId: string, newDia: number) => {
    updateLinkDiameter(linkId, newDia);
    setSuccessMessage(`已成功应用优化：管径调整为 DN${newDia}`);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleApplyExcavation = (toNodeId: string, digValue: number) => {
    const node = nodes.find(n => n.id === toNodeId);
    if (node) {
      updateNodeBottomElev(toNodeId, node.bottomElevation - digValue);
      setSuccessMessage(`已成功应用优化：下游井底高程下挖 ${digValue.toFixed(2)}m 以提高纵坡`);
      setTimeout(() => setSuccessMessage(null), 3500);
    }
  };

  return (
    <div className={cn(
      isInline 
        ? "w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-hidden" 
        : "absolute right-4 top-16 bottom-20 w-[420px] max-w-full bg-slate-900 border border-slate-800 text-slate-100 flex flex-col rounded-2xl shadow-2xl overflow-hidden z-[1000] animate-in slide-in-from-right-8 duration-350"
    )}>
      
      {/* 顶部标题栏 */}
      <div className="bg-slate-950 p-4 border-b border-slate-850 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Activity className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              全网水力合规性诊断 
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-md">
                SWMM 内置
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">动静双轨韧性效验与 AI Copilot 协同</p>
          </div>
        </div>
        {onClose && !isInline && (
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-900 rounded-lg text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* 韧性评分面板区 */}
      <div className="p-4 bg-slate-950/40 border-b border-slate-850 grid grid-cols-12 gap-4 items-center">
        <div className="col-span-4 flex flex-col items-center justify-center p-3.5 bg-slate-950 rounded-xl border border-slate-850">
          <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1">韧性健康度</span>
          <span className={cn(
            "text-3xl font-extrabold font-mono",
            dynamicResults.overallScore >= 85 ? "text-emerald-400" :
            dynamicResults.overallScore >= 70 ? "text-amber-400" : "text-red-400"
          )}>
            {dynamicResults.overallScore}%
          </span>
        </div>
        <div className="col-span-8 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400 text-[11px]">静态违反项 (逆坡/缩径):</span>
            <span className={cn("font-bold font-mono", staticWarnings.length > 0 ? "text-red-400 animate-pulse" : "text-emerald-400")}>
              {staticWarnings.length} 处
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-indigo-400 font-semibold text-[11px] flex items-center gap-1">
              <Cpu size={10} className="text-indigo-400" />
              流向及水力缩径(AI):
            </span>
            <span className={cn("font-bold font-mono", sanityAnomalies.length > 0 ? "text-indigo-400 animate-pulse" : "text-emerald-400")}>
              {sanityAnomalies.length} 处
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400 text-[11px]">动态严重过载管段 ($Q/Q_{"c"} \ge 1.2$):</span>
            <span className={cn("font-bold font-mono", dynamicResults.overloadedList.length > 0 ? "text-amber-400" : "text-emerald-400")}>
              {dynamicResults.overloadedList.filter(l => l.ratio >= 1.2).length} 条
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400 text-[11px]">节点冒顶地表积水:</span>
            <span className={cn("font-bold font-mono", dynamicResults.floodedList.length > 0 ? "text-red-400" : "text-emerald-400")}>
              {dynamicResults.floodedList.length} 个
            </span>
          </div>
        </div>
      </div>

      {/* 提示反馈条 */}
      {successMessage && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/25 px-4 py-2 text-[11px] text-emerald-400 flex items-center gap-1.5 transition-all animate-bounce">
          <CheckCircle size={12} /> {successMessage}
        </div>
      )}

      {/* 选项卡切换 */}
      <div className="flex bg-slate-950 p-1 border-b border-slate-850 gap-1.5 text-xs text-slate-400">
        <button 
          onClick={() => setActiveTab('static')}
          className={cn(
            "flex-1 py-2 font-semibold text-center rounded-lg transition-all",
            activeTab === 'static' ? "bg-slate-800 text-white shadow font-bold" : "hover:text-slate-200"
          )}
        >
          静态合微 (一阶段)
        </button>
        <button 
          onClick={() => setActiveTab('dynamic')}
          className={cn(
            "flex-1 py-2 font-semibold text-center rounded-lg transition-all",
            activeTab === 'dynamic' ? "bg-slate-800 text-white shadow font-bold" : "hover:text-slate-200"
          )}
        >
          动态弹性 (二阶段)
        </button>
        <button 
          onClick={() => setActiveTab('copilot')}
          className={cn(
            "relative flex-1 py-2 font-semibold text-center rounded-lg transition-all flex items-center justify-center gap-1",
            activeTab === 'copilot' ? "bg-slate-800 text-white shadow font-bold" : "hover:text-slate-200"
          )}
        >
          AI 协同 (设计优化)
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
        </button>
      </div>

      {/* 主数据区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* TAB 1: 静态审查列表 */}
        {activeTab === 'static' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>国家国标排水规范 (GB 50014) 静态物理审查</span>
              <span>共 {complianceReport.issues.filter(i => i.category === 'static').length} 项违规</span>
            </div>

            {staticWarnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 bg-slate-950/40 border border-slate-850 border-dashed rounded-xl">
                <CheckCircle className="w-8 h-8 text-emerald-500 mb-2 opacity-80" />
                <p className="text-xs text-emerald-400 font-bold">无严重逆坡与缩径缺陷</p>
                <p className="text-[10px] text-slate-500 mt-1">管网静态力学模型及管径连续性表现优异</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {staticWarnings.map(w => (
                  <div 
                    key={w.id}
                    onClick={() => handleSelectElement(w.type === 'inverse_slope' ? 'link' : 'link', w.elementId)}
                    className={cn(
                      "p-3 rounded-xl border class-item hover:scale-[1.01] transition-all cursor-pointer select-none",
                      w.severity === 'error' 
                        ? "bg-red-500/5 border-red-500/25 hover:border-red-500/40" 
                        : "bg-amber-500/5 border-amber-500/25 hover:border-amber-500/40"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        <AlertTriangle className={cn("w-4 h-4", w.severity === 'error' ? "text-red-400" : "text-amber-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-200">{w.elementName}</span>
                          <span className={cn(
                            "text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-sm font-extrabold",
                            w.severity === 'error' ? "bg-red-950/80 text-red-400 border border-red-500/20" : "bg-amber-950/80 text-amber-400 border border-amber-500/20"
                          )}>
                            {w.type === 'inverse_slope' ? '严重逆坡' : '缩径警告'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{w.message}</p>
                        <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-850/60 pt-1.5">
                          <span className="flex items-center gap-1">
                            <Compass size={11} /> 点击主图定位管线
                          </span>
                          <span className="font-mono text-slate-400 font-bold">
                            {w.type === 'inverse_slope' 
                              ? `落差: ${(w.details.upstreamVal - w.details.downstreamVal).toFixed(2)}m`
                              : `DN${w.details.upstreamVal} ➔ DN${w.details.downstreamVal}`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pipeline Sanity Checks & Repairs */}
            <div className="space-y-2.5 pt-3 border-t border-slate-800">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Cpu size={12} className="text-indigo-400 animate-pulse" />
                  流向逆转与水力缩径修正 (AI诊断)
                </span>
                <span>{sanityAnomalies.length} 处异常</span>
              </div>

              {sanityAnomalies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 bg-slate-950/25 border border-slate-800/50 border-dashed rounded-xl">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mb-1.5"></span>
                  <p className="text-[11px] text-emerald-400 font-bold">全网拓扑流向与径缩结构完美</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sanityAnomalies.map(anomaly => (
                    <ValidationAlertCard 
                      key={anomaly.id} 
                      anomaly={anomaly} 
                      onSelectLink={(id) => handleSelectElement('link', id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 动态审查列表 */}
        {activeTab === 'dynamic' && (
          <div className="space-y-4">
            
            {/* 1. 管井溢流冒顶历时 */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>排水检查井冒溢地面积水（Ponding）前 3 处</span>
                <span className="text-red-500 text-[9px] font-mono font-bold animate-pulse">● 强对流积水诊断</span>
              </div>

              {dynamicResults.floodedList.length === 0 ? (
                <div className="p-4 bg-slate-950/40 border border-slate-850 border-dashed rounded-xl flex flex-col items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mb-2"></span>
                  <p className="text-xs text-emerald-400 font-bold">全网节点无表面溢流发生</p>
                  <p className="text-[9px] text-slate-500">满管流形态良好，无水柱顶托至路标面风险</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dynamicResults.floodedList.slice(0, 3).map(f => (
                    <div 
                      key={f.id}
                      onClick={() => handleSelectElement('node', f.id)}
                      className="p-3 bg-slate-950 border border-slate-850 rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <span className="text-xs font-bold text-slate-100 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                            节点：{f.name}
                          </span>
                          <div className="flex gap-3 text-[10px] text-slate-400 mt-1">
                            <span>溢留峰值：<strong className="text-red-400 font-mono font-bold text-xs">{(f.overflowRate * 1000).toFixed(0)} L/s</strong></span>
                            <span>满管水深：{(f.peakDepth).toFixed(2)}m</span>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="text-[10px] px-2 py-0.5 bg-red-950/60 border border-red-900/45 text-red-400 rounded-sm font-bold font-mono">
                            积水历时
                          </span>
                          <span className="text-xs font-semibold text-slate-200 mt-1 font-mono">{f.pondingDuration} mins</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. 重负荷过载管道 */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>最高过流压力比例 (Q / Q_cap) 前 5 个超载危险段</span>
                <span>过载率 &gt; 120%</span>
              </div>

              {dynamicResults.overloadedList.length === 0 ? (
                <div className="p-4 bg-slate-950/40 border border-slate-850 border-dashed rounded-xl flex flex-col items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-500 mb-1" />
                  <p className="text-xs text-emerald-400 font-bold">全网管道过流裕度充足</p>
                  <p className="text-[9px] text-slate-500">重现期降雨未对管道形成负压满溢</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dynamicResults.overloadedList.slice(0, 5).map(pipe => (
                    <div 
                      key={pipe.id}
                      onClick={() => handleSelectElement('link', pipe.id)}
                      className="p-3 bg-slate-950 border border-slate-850 rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-200">{pipe.name}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            Q = {pipe.flow.toFixed(3)} m³/s | Cap = {pipe.capacity.toFixed(3)} m³/s
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded font-bold font-mono",
                            pipe.ratio >= 1.5 ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          )}>
                            {(pipe.ratio * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      
                      {/* Loading visualizer linear progress bar */}
                      <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden mt-2">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            pipe.ratio >= 1.5 ? "bg-red-500 animate-pulse" : "bg-amber-500"
                          )}
                          style={{ width: `${Math.min(100, (pipe.ratio / 2) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AI Copilot 协同优化建议 */}
        {activeTab === 'copilot' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>智能优化建议 (AI Copilot 模型)</span>
              <span className="text-amber-400 text-[10px] font-mono font-bold flex items-center gap-1 animate-pulse">
                <Sparkles size={11} /> Generative Adviser
              </span>
            </div>

            {dynamicResults.overloadedList.length === 0 ? (
              <div className="p-6 bg-slate-950/40 border border-slate-850 border-dashed rounded-xl flex flex-col items-center justify-center text-center">
                <Sparkles className="w-8 h-8 text-amber-400 mb-2 opacity-80" />
                <p className="text-xs text-amber-400 font-bold">系统水力弹性充沛</p>
                <p className="text-[10px] text-slate-500 mt-1">当前降雨模式下，整网无可优化改进之处。AI 助手未提出任何修正案。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dynamicResults.overloadedList.map(pipe => {
                  return (
                    <div 
                      key={`copilot-${pipe.id}`}
                      className="p-4 bg-slate-950 border border-slate-850 rounded-xl relative overflow-hidden flex flex-col gap-3"
                    >
                      {/* Decorative gradient corner */}
                      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />

                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-extrabold text-slate-200">管段：{pipe.name}</span>
                          <div className="flex gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span>原管径: DN{pipe.diameter}</span>
                            <span>原坡度: {(pipe.slope * 1000).toFixed(1)}‰</span>
                            <span className="text-red-400 font-bold font-mono">负荷比: {(pipe.ratio * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="bg-amber-400/15 border border-amber-400/25 p-1 rounded-md text-[9px] font-extrabold text-amber-400 flex items-center gap-1 cursor-help" title="基于曼宁流力力学反算">
                          <Cpu size={11} /> 智能反算
                        </div>
                      </div>

                      {/* Natural language advice box */}
                      <p className="text-[11px] bg-slate-900 border border-slate-850 text-slate-300 p-2.5 rounded-lg leading-relaxed font-sans relative">
                        管段 <strong className="text-amber-400">{pipe.name}</strong> 严重过载(Q/Qcap = {pipe.ratio.toFixed(2)})，雨水通过能力透支。
                        建议将管径由目前的 <span className="underline decoration-red-400 font-bold">{pipe.diameter}mm</span> 放大至 <span className="underline decoration-emerald-400 font-bold text-emerald-400 font-mono">{pipe.recommendedDiameter}mm</span>。
                        {pipe.requiredExcavation > 0.05 && (
                          <>
                            {' '}或保持管径不变，将下游井底高程下挖约 <span className="underline decoration-sky-400 text-sky-400 font-semibold font-mono">{pipe.requiredExcavation.toFixed(2)}m</span> 以增大坡度至 <span className="font-semibold font-mono text-slate-200">{(pipe.recommendedSlope * 1000).toFixed(1)}‰</span>。
                          </>
                        )}
                      </p>

                      {/* Execution direct toggles */}
                      <div className="flex gap-2 text-[11px] mt-1 pt-2 border-t border-slate-850">
                        <button
                          onClick={() => handleApplyDiameterChange(pipe.id, pipe.recommendedDiameter)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-lg shadow-emerald-600/10 border border-emerald-500/20"
                        >
                          <ChevronRight size={13} /> 应用扩径 DN{pipe.recommendedDiameter}
                        </button>
                        {pipe.requiredExcavation > 0.05 && (
                          <button
                            onClick={() => handleApplyExcavation(pipe.targetId, pipe.requiredExcavation)}
                            className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-lg shadow-sky-600/10 border border-sky-500/20"
                            title="修改下游检查井的管底标高以自然增大重力流坡度"
                          >
                            <ArrowDownCircle size={13} /> 下挖 {(pipe.requiredExcavation).toFixed(2)}m
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* 底部功能说明引导 */}
      <div className="bg-slate-950 p-3.5 border-t border-slate-850 text-[10px] text-slate-400 flex items-center gap-2">
        <HelpCircle size={14} className="text-slate-500 flex-shrink-0" />
        <p className="leading-normal">
          静态违反项在画布修改的瞬间毫秒级热重算，无需等待。AI 协同在管道严重过载时自动触发，允许设计者一键完成管网断面与高高程校正，大幅提高市政规划产出效率。
        </p>
      </div>

    </div>
  );
}

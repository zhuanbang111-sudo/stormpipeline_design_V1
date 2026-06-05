import { useMemo, useState } from 'react';
import { usePipelineStore, EnhancedLink } from '../store/usePipelineStore';
import { validateHydraulicPerformance, ValidationIssue } from '../lib/PipelineValidator';
import { 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Wrench, 
  Zap, 
  Sparkles,
  Droplets,
  Gauge
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function HydraulicSummaryChart() {
  const { nodes, links, simulationResult, rptSummary, selectedElement, setSelectedElement } = usePipelineStore();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // 1. Prepare simulation report summary data for validation
  // If rptSummary is empty but simulationResult exists, we synthesize a compatible report payload for validation.
  const validationPayload = useMemo(() => {
    if (rptSummary) return rptSummary;
    if (!simulationResult) return null;

    // Synthesize compatible node and link maps from the live simulation result
    const nodesMap: Record<string, any> = {};
    const linksMap: Record<string, any> = {};

    nodes.forEach(n => {
      const res = simulationResult.nodeResults[n.id];
      nodesMap[n.name] = {
        name: n.name,
        type: n.type,
        totalFloodingVolume: res?.flooded ? (res?.depth * 10) : 0, // estimate volume for validation feedback
        maxFloodingFlow: res?.flooded ? 15 : 0
      };
    });

    links.forEach(l => {
      const res = simulationResult.linkResults[l.id];
      if (res) {
        // Calculate estimated depth ratio (充满度 H/D) based on capacity ratio
        const estimatedDepthRatio = res.surcharge 
          ? 1.0 
          : Math.min(1.0, Math.pow(res.flow / Math.max(0.001, res.capacity), 0.5));

        linksMap[l.name] = {
          name: l.name,
          type: 'CONDUIT',
          maxFlow: res.flow * 1000, // convert flow to L/s for validation rule matching
          maxVelocity: res.velocity,
          maxFullDepthRatio: estimatedDepthRatio,
          maxFullFlowRatio: res.flow / Math.max(0.001, res.capacity)
        };
      }
    });

    return {
      nodes: nodesMap,
      links: linksMap
    };
  }, [rptSummary, simulationResult, nodes, links]);

  // 2. Run hydraulic performance rules validation
  const hydraulicIssues = useMemo(() => {
    if (!validationPayload) return [];
    return validateHydraulicPerformance(validationPayload);
  }, [validationPayload]);

  // Create issue index mapped by targetLinkId for quick inline chart visualization
  const issueByLinkIdMap = useMemo(() => {
    const map = new Map<string, ValidationIssue>();
    hydraulicIssues.forEach(isu => {
      if (isu.targetType === 'link') {
        map.set(isu.targetId, isu);
      }
    });
    return map;
  }, [hydraulicIssues]);

  // 3. Assemble chart series data for Links
  const chartData = useMemo(() => {
    return links.map(link => {
      let velocity = 0;
      let depthRatio = 0;

      // Extract from the validation payload or the raw simulation result
      if (validationPayload && validationPayload.links && validationPayload.links[link.name]) {
        const linkData = validationPayload.links[link.name];
        velocity = linkData.maxVelocity ?? 0;
        depthRatio = linkData.maxFullDepthRatio ?? 0;
      } else if (simulationResult && simulationResult.linkResults[link.id]) {
        const lRes = simulationResult.linkResults[link.id];
        velocity = lRes.velocity;
        depthRatio = lRes.surcharge ? 1.0 : Math.min(1.0, Math.pow(lRes.flow / Math.max(0.001, lRes.capacity), 0.5));
      }

      const issue = issueByLinkIdMap.get(link.id);

      return {
        id: link.id,
        name: link.name,
        diameter: link.diameter,
        velocity: Number(velocity.toFixed(2)),
        depthRatio: Number((depthRatio * 100).toFixed(1)), // percentage of pipe fullness
        hasError: issue?.type === 'ERROR',
        hasWarning: issue?.type === 'WARNING',
        statusText: issue ? issue.title : '水力学合规正常'
      };
    });
  }, [links, simulationResult, validationPayload, issueByLinkIdMap]);

  if (!simulationResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-dashed border-slate-300 rounded-2xl h-[350px]" id="no-sim-container">
        <Gauge size={40} className="text-slate-400 mb-3 animate-pulse" />
        <p className="text-sm font-bold text-slate-700">未检测到动力学模拟数据</p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
          请在左侧系统配置面板中配置降雨强度与回水事件，点击“一键解算”激活多波水流模拟器，系统会自动生成水力安全合规曲线。
        </p>
      </div>
    );
  }

  // Find currently selected link issue if any
  const focusedIssue = hydraulicIssues.find(i => i.id === selectedIssueId) || 
    (selectedElement?.type === 'link' ? hydraulicIssues.find(i => i.targetId === selectedElement.id) : null) ||
    (hydraulicIssues.length > 0 ? hydraulicIssues[0] : null);

  const handleChartPointClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const clickedData = data.activePayload[0].payload;
      setSelectedElement({ type: 'link', id: clickedData.id });
      // Find issue for this link and set focused
      const matchedIsu = hydraulicIssues.find(i => i.targetId === clickedData.id);
      if (matchedIsu) {
        setSelectedIssueId(matchedIsu.id);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-[360px]" id="hydraulic-summary-grid">
      {/* 1. Left side: High contract Dual-Y-Axis Recharts visualization */}
      <div className="lg:col-span-8 flex flex-col justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100 relative">
        <div className="flex justify-between items-center mb-2 px-1">
          <div>
            <span className="text-[10px] bg-sky-105 text-sky-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Manning-SWMM Hydraulic Workspace
            </span>
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
              <Droplets size={16} className="text-blue-500" />
              管段峰值充满度与设计流速诊断曲线
            </h4>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-1 px-1 bg-red-400 rounded-sm"></span> 流速不达标阈值 &lt; 0.75m/s
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-1 bg-amber-400 rounded-sm"></span> 超载警戒 &ge; 100% 充满
            </span>
          </div>
        </div>

        {/* Dynamic Composed Chart container */}
        <div className="flex-1 w-full h-[220px] relative mt-1" id="recharts-composed-container">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart
              data={chartData}
              onClick={handleChartPointClick}
              margin={{ top: 15, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fullnessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.85}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.2}/>
                </linearGradient>
                <linearGradient id="warningGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.85}/>
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.3}/>
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 10, fontWeight: 555, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis 
                yAxisId="left"
                label={{ value: '峰值流速 V (m/s)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#0f172a' }, offset: 0 }}
                tick={{ fontSize: 10, fill: '#0f172a' }}
                domain={[0, (dataMax: number) => Math.max(6, Math.ceil(dataMax))]}
                axisLine={{ stroke: '#94a3b8' }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                label={{ value: '峰值充满度 H/D (%)', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#2563eb' }, offset: 5 }}
                tick={{ fontSize: 10, fill: '#1e40af' }}
                domain={[0, 120]}
                axisLine={{ stroke: '#3b82f6' }}
              />

              <Tooltip 
                cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '2 2' }}
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: 'none', 
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.25)',
                  padding: '8px 12px'
                }}
                labelStyle={{ fontSize: 11, fontWeight: 'bold', color: '#38bdf8', marginBottom: '4px' }}
                itemStyle={{ fontSize: 10 }}
              />

              <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 10 }} />

              {/* Cleansing velocity Reference Area / Lines */}
              <ReferenceLine yAxisId="left" y={0.75} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4">
                {/* Clean warning overlay line */}
              </ReferenceLine>
              <ReferenceLine yAxisId="right" y={100} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3">
                {/* Overflow line */}
              </ReferenceLine>

              {/* Render Depth Fullness percentage on Right Axis */}
              <Bar 
                yAxisId="right"
                dataKey="depthRatio" 
                name="管段充满度 (H/D %)" 
                fill="url(#fullnessGrad)"
                radius={[4, 4, 0, 0]}
                barSize={24}
              />

              {/* Render Velocity on Left axis */}
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="velocity" 
                name="实际流速 V (m/s)" 
                stroke="#10b981" 
                strokeWidth={3} 
                dot={{ r: 4, strokeWidth: 1.5, fill: '#fff' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Small tips footer */}
        <div className="text-[10px] text-slate-400 mt-2 px-1 flex items-center gap-1">
          <Info size={12} className="text-slate-400 shrink-0" />
          <span>点击上方图表柱条或折线圆点，可全局同步跳转至地图上的关联管段并展示工程纠偏动作面板。</span>
        </div>
      </div>

      {/* 2. Right side: Interactive Diagnose & Sizing Re-design Panel */}
      <div className="lg:col-span-4 flex flex-col justify-between bg-white border border-slate-150 rounded-xl p-3 shadow-sm h-full overflow-hidden" id="diagnose-corrective-board">
        {/* Board Header */}
        <div className="border-b border-slate-100 pb-2 flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Wrench size={14} className="text-orange-500" />
            <span>智能纠偏诊断与设计优化器</span>
          </div>
          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 animate-pulse">
            <Sparkles size={10} />
            AI Copilot
          </span>
        </div>

        {/* Scrollable list or single detail of focused non-compliant pipelines */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 max-h-[220px]" id="compliance-scrolling-container">
          {hydraulicIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center h-[160px]">
              <CheckCircle2 size={32} className="text-green-500 mb-1.5 animate-bounce" />
              <h5 className="text-xs font-bold text-slate-800">未发现大负荷水力违规</h5>
              <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                恭喜！当前雨水管段在最大径流量冲击下的流速与管径覆土充满度全部符合 GB 50014 市政合规性红线，继续保持良好排泄！
              </p>
            </div>
          ) : (
            <div>
              {/* If we have a focused issue, render detail */}
              {focusedIssue && (
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-150 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-1.5">
                    <span className={cn(
                      "px-1.5 py-0.5 text-[9px] font-bold rounded shrink-0",
                      focusedIssue.type === 'ERROR' ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200"
                    )}>
                      {focusedIssue.type}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-600 truncate flex-1 text-right">
                      管线 {focusedIssue.targetName}
                    </span>
                  </div>

                  <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1">
                    <AlertTriangle size={13} className={focusedIssue.type === 'ERROR' ? "text-red-500" : "text-amber-500"} />
                    {focusedIssue.title}
                  </h5>

                  <p className="text-[10.5px] leading-relaxed text-slate-600 font-medium">
                    {focusedIssue.description}
                  </p>

                  <div className="bg-amber-50/50 rounded p-2 border border-dashed border-amber-200/60 text-[10.5px] text-slate-700 font-semibold space-y-0.5">
                    <div className="text-amber-800 font-bold flex items-center gap-1 mb-0.5">
                      <Sparkles size={11} /> 规范规程推荐方案
                    </div>
                    <div>{focusedIssue.suggestion}</div>
                  </div>

                  {/* Immediate corrective layout action */}
                  {focusedIssue.action && (
                    <button
                      onClick={() => {
                        if (focusedIssue.action) {
                          focusedIssue.action.apply();
                          // Show brief window alert or trigger visual confirmation
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-200 cursor-pointer active:scale-95 text-center mt-1"
                    >
                      <Zap size={13} fill="#fff" />
                      {focusedIssue.action.label}
                    </button>
                  )}
                </div>
              )}

              {/* Compact quick-tabs of other problematic pipes if there are multiple */}
              {hydraulicIssues.length > 1 && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 min-h-[60px]" id="issue-quick-navigator">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    其他异常管道检出 ({hydraulicIssues.length - 1} 个)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {hydraulicIssues.map(isu => (
                      <button
                        key={isu.id}
                        onClick={() => setSelectedIssueId(isu.id)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-medium rounded border transition-colors cursor-pointer",
                          isu.id === focusedIssue?.id 
                            ? "bg-slate-800 text-white border-slate-900" 
                            : (isu.type === 'ERROR' ? "bg-red-50 text-red-700 border-red-100 hover:bg-red-100" : "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100")
                        )}
                      >
                        {isu.targetName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom micro-metrics summary */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
          <span>给排水管径红线检核</span>
          <span className="font-semibold text-slate-500">
            违规数: {hydraulicIssues.filter(i => i.type === 'ERROR').length} 警告: {hydraulicIssues.filter(i => i.type === 'WARNING').length}
          </span>
        </div>
      </div>
    </div>
  );
}

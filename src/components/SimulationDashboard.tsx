import React, { useEffect, useMemo, useState } from 'react';
import { usePipelineStore } from '../store/usePipelineStore';
import { groupUpstreamCatchments } from '../engine/CatchmentGenerator';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Sparkles, 
  GitFork, 
  Droplet, 
  Info,
  Scale
} from 'lucide-react';

export default function SimulationDashboard() {
  const { 
    nodes, 
    links, 
    catchments, 
    simulationResult, 
    simulationParams, 
    selectedElement, 
    currentTimeStep, 
    isPlaying, 
    playbackSpeed,
    updateCatchment,
    setCurrentTimeStep,
    setIsPlaying,
    setPlaybackSpeed,
    runSim
  } = usePipelineStore();

  const [loopPlayback, setLoopPlayback] = useState(true);
  const [mergedPerimeter, setMergedPerimeter] = useState<{ vertices: [number, number][][]; area: number } | null>(null);

  // Auto-playing logic
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying) {
      // Speed multiplier maps: 1x -> 1000ms increment, 2x -> 500ms, 5x -> 200ms
      const speedMs = Math.round(1000 / playbackSpeed);
      interval = setInterval(() => {
        setCurrentTimeStep((currentTimeStep + 2) > (simulationParams.stormDuration + 30)
          ? (loopPlayback ? 0 : currentTimeStep) // loop or cap
          : currentTimeStep + 2
        );
      }, speedMs);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, currentTimeStep, playbackSpeed, loopPlayback, simulationParams.stormDuration]);

  // Recalculate simulation on params change
  useEffect(() => {
    runSim();
  }, [nodes.length, links.length, catchments.length]);

  // Track merged sub-catchments for active link
  const activeLinkId = useMemo(() => {
    if (selectedElement?.type === 'link') {
      return selectedElement.id;
    }
    return null;
  }, [selectedElement]);

  const handleMergeUpstream = () => {
    if (!activeLinkId) return;
    const result = groupUpstreamCatchments(nodes, links, catchments, activeLinkId);
    if (result) {
      setMergedPerimeter({
        vertices: result.mergedVertices,
        area: result.totalArea
      });
    } else {
      alert("未找到该管道上游连接的集水单元。");
    }
  };

  const handleClearMerge = () => {
    setMergedPerimeter(null);
  };

  // Grid coordinates mapping for schema-net
  // Standard bounding box scaling for Schematics
  const boundingBox = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }, [nodes]);

  const mapToSchematicCoords = (x: number, y: number, width: number, height: number) => {
    const { minX, maxX, minY, maxY } = boundingBox;
    const dx = maxX - minX || 0.001;
    const dy = maxY - minY || 0.001;

    // Pad with margins
    const margin = 50;
    const schemX = margin + ((x - minX) / dx) * (width - margin * 2);
    // Invert Y for typical screen Cartesian logic
    const schemY = height - margin - ((y - minY) / dy) * (height - margin * 2);

    return { x: schemX, y: schemY };
  };

  // Timeline-specific dynamic hydrograph data
  const hydrographData = useMemo(() => {
    if (!simulationResult || !simulationResult.timeSeries) return [];
    return simulationResult.timeSeries;
  }, [simulationResult]);

  return (
    <div id="sim-control-cockpit" className="w-full text-slate-100 flex flex-col gap-5 p-1 bg-slate-950 rounded-2xl select-none">
      
      {/* Simulation Timeline Controls */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
              <Droplet className="w-6 h-6 text-sky-400 animate-bounce" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold tracking-tight text-white flex items-center gap-2">
                智能雨水管网时序仿真系统 
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md">
                  Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">Digital Twin Storm Simulator | Step: {currentTimeStep} min / {simulationParams.stormDuration} min</p>
            </div>
          </div>

          {/* Core Player Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                isPlaying 
                ? 'bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 shadow-amber-500/20' 
                : 'bg-sky-500 hover:bg-sky-450 text-white font-semibold shadow-sky-500/20'
              } shadow-lg`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isPlaying ? '暂停模拟' : '启动仿真'}
            </button>

            <button 
              onClick={() => setCurrentTimeStep(0)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-xs flex items-center gap-2 transition-all text-slate-350"
              title="Reset timeline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>

            <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-0.5">
              {([1, 2, 5] as const).map(speed => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2.5 py-1 text-[10px] sm:text-xs font-mono font-bold rounded-lg transition-all ${
                    playbackSpeed === speed 
                    ? 'bg-sky-500 text-white font-extrabold shadow' 
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-[11px] text-slate-350 font-medium">
              <input 
                type="checkbox" 
                checked={loopPlayback}
                onChange={(e) => setLoopPlayback(e.target.checked)}
                className="rounded border-slate-750 text-sky-500 bg-slate-950 focus:ring-sky-500/30 w-3.5 h-3.5 cursor-pointer"
              />
              循环播放
            </label>
          </div>
        </div>

        {/* Sliders line */}
        <div className="flex items-center gap-4 w-full">
          <span className="text-xs font-mono font-bold text-slate-400 w-12 text-left">0 min</span>
          <input 
            type="range"
            min="0"
            max={simulationParams.stormDuration + 30}
            step="1"
            value={currentTimeStep}
            onChange={(e) => setCurrentTimeStep(Number(e.target.value))}
            className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
          />
          <span className="text-xs font-mono font-bold text-sky-400 w-16 text-right">
            {currentTimeStep} min
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Schematic Twin: Col-7 */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl min-h-[360px]">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-1">
            <span className="text-xs font-bold tracking-wider text-slate-400 flex items-center gap-1.5 uppercase">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              Digital Twin Flow Schematic (数字拓扑双胞胎)
            </span>
            <div className="flex gap-2.5 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>&lt;50%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>50-90%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>&gt;90%</span>
            </div>
          </div>

          {/* SVG Schematic map */}
          <div className="flex-1 relative bg-slate-950 border border-slate-850 rounded-xl overflow-hidden min-h-[290px] w-full flex items-center justify-center">
            
            {/* Legend guide info inside map */}
            <div className="absolute bottom-2.5 left-3 flex flex-col gap-1.5 pointer-events-none z-10 text-[9px] sm:text-[10px] text-slate-400 bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg font-mono">
              <span className="text-white font-bold mb-1">动态图例说明</span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                管道安全 (Q &lt; 50% 满)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                负载预警 (50-90% 满)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                超载严重或节点冒溢 (&gt;90%)
              </span>
              {mergedPerimeter && (
                <span className="flex items-center gap-2 text-emerald-400 mt-1">
                  <span className="w-2 h-2 border border-emerald-400 bg-emerald-950 rounded-sm"></span>
                  融合区: {mergedPerimeter.area.toFixed(2)} ha
                </span>
              )}
            </div>

            <svg className="w-full h-full min-h-[290px]" viewBox="0 0 600 300">
              <defs>
                {/* CSS animated circles ripple wave effect */}
                <style>{`
                  @keyframes pulseRipple {
                    0% { r: 5px; opacity: 1; stroke-width: 2px; }
                    50% { opacity: 0.6; stroke-width: 4px; }
                    100% { r: 35px; opacity: 0; stroke-width: 1px; }
                  }
                  .ripple-wave {
                    animation: pulseRipple 1.8s cubic-bezier(0.25, 0, 0, 1) infinite;
                  }
                `}</style>
              </defs>

              {/* Grid backdrop */}
              <g stroke="#ffffff03" strokeWidth="1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <line key={`lh-${i}`} x1="0" y1={i * 25} x2="600" y2={i * 25} />
                ))}
                {Array.from({ length: 24 }).map((_, i) => (
                  <line key={`lv-${i}`} x1={i * 25} y1="0" x2={i * 25} y2="300" />
                ))}
              </g>

              {/* Subcatchment merged perimeter */}
              {mergedPerimeter && (() => {
                // Approximate coordinate projection inside 600x300 canvas
                // Convert each coordinate to schematic representation
                return mergedPerimeter.vertices.map((ring, ringIdx) => {
                  const pointsStr = ring.map(pt => {
                    const mapped = mapToSchematicCoords(pt[1], pt[0], 600, 300);
                    return `${mapped.x},${mapped.y}`;
                  }).join(' ');

                  return (
                    <polygon
                      key={`merged-poly-${ringIdx}`}
                      points={pointsStr}
                      fill="#10b981"
                      fillOpacity="0.1"
                      stroke="#34d399"
                      strokeWidth="2"
                      strokeDasharray="5,3"
                    />
                  );
                });
              })()}

              {/* Basic pipeline segments */}
              {links.map(link => {
                const upstream = nodes.find(n => n.id === link.source);
                const downstream = nodes.find(n => n.id === link.target);
                if (!upstream || !downstream) return null;

                const ptUp = mapToSchematicCoords(upstream.x, upstream.y, 600, 300);
                const ptDown = mapToSchematicCoords(downstream.x, downstream.y, 600, 300);

                // Fetch real-time load ratio
                let ratio = 0;
                const capacity = simulationResult?.linkResults[link.id]?.capacity ?? 1;
                const currentSimFlow = simulationResult?.linkResults[link.id]?.flow ?? 0;
                // Timeline dynamic scaling flow simulation
                const timeRatio = simulationResult?.timeSeries[Math.floor(currentTimeStep / 2) * 2] 
                  ? (currentTimeStep <= simulationParams.stormDuration 
                    ? currentTimeStep / simulationParams.stormDuration 
                    : Math.max(0, 1 - (currentTimeStep - simulationParams.stormDuration) / 20))
                  : 1;
                
                const timelineFlow = currentSimFlow * timeRatio;
                ratio = capacity > 0 ? timelineFlow / capacity : 0;

                // Color mapping: load < 50% Cyan, 50-90% Amber, >90% Red
                let strokeColor = '#06b6d4'; // cyan-500
                if (ratio >= 0.9) strokeColor = '#ef4444'; // red-500
                else if (ratio >= 0.5) strokeColor = '#f59e0b'; // amber-500

                const isSelected = selectedElement?.type === 'link' && selectedElement.id === link.id;

                return (
                  <g key={`schem-link-${link.id}`}>
                    {/* Glowing underlay if selected */}
                    {isSelected && (
                      <line
                        x1={ptUp.x}
                        y1={ptUp.y}
                        x2={ptDown.x}
                        y2={ptDown.y}
                        stroke="#f59e0b"
                        strokeWidth="8"
                        strokeLinecap="round"
                        opacity="0.35"
                      />
                    )}
                    <line
                      x1={ptUp.x}
                      y1={ptUp.y}
                      x2={ptDown.x}
                      y2={ptDown.y}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? "5" : "3.5"}
                      strokeLinecap="round"
                    >
                      <title>{`${link.name}: Flow = ${timelineFlow.toFixed(3)} m³/s (Cap: ${capacity.toFixed(3)})`}</title>
                    </line>
                  </g>
                );
              })}

              {/* Overflow Ripple wave generators & Manholes */}
              {nodes.map(node => {
                const pt = mapToSchematicCoords(node.x, node.y, 600, 300);
                
                // Get timeline-scaled water depth and check if overflow spilling occurs under timeline load
                const isOutfall = node.type === 'outfall';
                const baseSpill = node.overflowRate;
                const timeRatio = currentTimeStep <= simulationParams.stormDuration 
                  ? currentTimeStep / simulationParams.stormDuration 
                  : Math.max(0, 1 - (currentTimeStep - simulationParams.stormDuration) / 20);
                const timelineSpill = baseSpill * timeRatio;
                const isFlooding = timelineSpill > 0;

                return (
                  <g key={`schem-node-${node.id}`} className="cursor-pointer">
                    {/* Spill ripples wave */}
                    {isFlooding && (
                      <>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="25"
                          fill="none"
                          stroke="#ef4444"
                          className="ripple-wave"
                        />
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="10"
                          fill="#ef4444"
                          fillOpacity="0.45"
                          className="animate-ping"
                        />
                      </>
                    )}

                    {/* Outer node circle casing */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={node.type === 'outfall' ? "8.5" : "7.5"}
                      fill={node.type === 'outfall' ? "#ef4444" : "#1e293b"}
                      stroke={selectedElement?.type === 'node' && selectedElement.id === node.id ? "#f59e0b" : "#475569"}
                      strokeWidth="2.5"
                    />

                    {/* Inner core display */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="3.5"
                      fill={isFlooding ? "#ef4444" : (node.type === 'outfall' ? "#fff" : "#0ea5e9")}
                    />

                    {/* Simple name label */}
                    <text
                      x={pt.x}
                      y={pt.y - 12}
                      textAnchor="middle"
                      className="fill-slate-450 font-mono text-[9px] font-bold"
                      style={{ textShadow: '1px 1px 1px #020617' }}
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Real-time details charts & sub-catchment tool: Col-5 */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Section A: Topological Drainage merger tool info */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 flex items-center gap-2 uppercase">
              <GitFork className="w-4 h-4 text-emerald-400" />
              TOPOLOGICAL SUB-CATCHMENT TOOL (排水分区拓扑融合)
            </h3>
            
            {activeLinkId ? (
              <div className="flex flex-col gap-2.5">
                <div className="bg-slate-950/80 border border-slate-850 p-3 rounded-xl flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-400 leading-relaxed">
                    当前已选中管道 <span className="text-sky-400 font-mono font-bold">{links.find(l => l.id === activeLinkId)?.name}</span>。
                    点击下方按钮，系统将根据上游管网连接结构进行逆流拓扑回溯，将全部输入集水多边形融合为大排水分区。
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={handleMergeUpstream}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-550 border border-emerald-500 rounded-xl text-xs font-bold transition-all text-white flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/10"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    进行上游汇合多边形融合
                  </button>
                  {mergedPerimeter && (
                    <button 
                      onClick={handleClearMerge}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-750 rounded-xl text-xs font-bold text-slate-300 transition-all border border-slate-700"
                    >
                      清理
                    </button>
                  )}
                </div>

                {mergedPerimeter && (
                  <div className="bg-emerald-950/20 border border-emerald-500/25 p-3.5 rounded-xl flex flex-col gap-1 hover:border-emerald-500/40 transition-all">
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wide text-emerald-500">
                      计算成果 (Total Service Area)
                    </span>
                    <span className="text-lg font-bold font-mono text-emerald-400">
                      {mergedPerimeter.area.toFixed(2)} ha (公顷)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      包含上游节点单元: {mergedPerimeter.vertices.length} 个
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-950 rounded-xl text-center text-slate-500 border border-slate-850 text-xs">
                请先在主地图或左侧双胞胎视图中选择任意管段线 (Link)，方可启动拓扑反向融合追踪。
              </div>
            )}
          </div>

          {/* Section B: Flow Recharts monitoring */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col gap-3 min-h-[190px]">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 flex items-center gap-1.5 uppercase">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Dynamic Hydrograph Analysis (雨洪径流过程线)
            </h3>
            
            <div className="flex-1 min-h-[140px] w-full mt-1.5">
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart
                  data={hydrographData}
                  margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="runoffGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity="0.3"/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity="0.25"/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="time" 
                    stroke="#475569" 
                    fontSize={9}
                    tickFormatter={(v) => `${v}m`}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={9} 
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '10px' }}
                    labelFormatter={(v) => `历时: ${v} min`}
                  />
                  {/* Vertical cursor mapping line */}
                  <ReferenceLine x={currentTimeStep} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3"/>
                  
                  <Area 
                    type="monotone" 
                    dataKey="totalRunoff" 
                    stroke="#0ea5e9" 
                    fillOpacity={1} 
                    fill="url(#runoffGrad)" 
                    name="总汇水量 (m³/s)"
                    strokeWidth={1.5}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="totalOutfall" 
                    stroke="#ef4444" 
                    fillOpacity={1} 
                    fill="url(#outflowGrad)" 
                    name="排放口流量 (m³/s)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1 border-t border-slate-850 pt-2">
              <span>降雨峰位 locator (黄虚线): {currentTimeStep}分</span>
              <span className="text-sky-500">雨阻径流稳态流量</span>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

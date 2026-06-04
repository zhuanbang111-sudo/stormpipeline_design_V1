import React, { useState, useMemo } from 'react';
import Draggable from 'react-draggable';
import { 
  X, 
  Download, 
  Play, 
  Settings, 
  LineChart as ChartIcon, 
  Info, 
  Check, 
  Maximize2, 
  Minimize2, 
  CloudRain,
  HelpCircle,
  Table,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { usePipelineStore } from '../store/usePipelineStore';

interface ChicagoRainGeneratorProps {
  onClose: () => void;
}

const SHENZHEN_PRESETS = [
  { name: '深圳西部 (Western)', A: 2698.815, C: 0.593, b: 11.03, n: 0.648 },
  { name: '深圳中部 (Central)', A: 2253.3, C: 0.647, b: 10.45, n: 0.627 },
  { name: '深圳东部 (Eastern)', A: 1914.8, C: 0.695, b: 9.84, n: 0.605 },
  { name: '广州 (Guangzhou)', A: 2446.7, C: 0.552, b: 11.7, n: 0.72 },
  { name: '北京 (Beijing)', A: 1602.0, C: 0.559, b: 9.0, n: 0.659 },
  { name: '上海 (Shanghai)', A: 2434.0, C: 0.55, b: 12.0, n: 0.72 },
  { name: '其他城市 (Other Cities)', A: 2000.0, C: 0.60, b: 10.0, n: 0.60 }
];

export default function ChicagoRainGenerator({ onClose }: ChicagoRainGeneratorProps) {
  const { simulationParams, setSimulationParams } = usePipelineStore();
  const [size, setSize] = useState({ width: 980, height: 580 });
  const [isMinimized, setIsMinimized] = useState(false);
  const nodeRef = React.useRef<HTMLDivElement>(null);

  // States for applying loading and target pipeline region selection
  const [isApplying, setIsApplying] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<'western' | 'central' | 'eastern' | 'guangzhou' | 'beijing' | 'shanghai' | 'custom'>(
    simulationParams.region || 'central'
  );

  // Use a ResizeObserver in requestAnimationFrame to dynamically update child chart size as user resizes beautifully!
  React.useEffect(() => {
    if (isMinimized || !nodeRef.current) return;
    const observer = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        // Verify changes are real to prevent re-render loops
        if (width > 450 && height > 200) {
          setSize(prev => {
            if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
              return prev;
            }
            return { width: Math.round(width), height: Math.round(height) };
          });
        }
      });
    });
    observer.observe(nodeRef.current);
    return () => {
      observer.disconnect();
    };
  }, [isMinimized]);

  // Parameter State
  const [A, setA] = useState(simulationParams.formulaParams?.A ?? 2253.3);
  const [C, setC] = useState(simulationParams.formulaParams?.C ?? 0.647);
  const [b, setb] = useState(simulationParams.formulaParams?.b ?? 10.45);
  const [n, setn] = useState(simulationParams.formulaParams?.n ?? 0.627);
  const [P, setP] = useState(simulationParams.returnPeriod ?? 5);
  const [T, setT] = useState(simulationParams.stormDuration ?? 120);
  const [deltaT, setDeltaT] = useState(5);
  const [r, setr] = useState(0.4);
  
  const [viewMode, setViewMode] = useState<'chart' | 'cumulative' | 'table'>('chart');
  const [showAppliedToast, setShowAppliedToast] = useState(false);

  // Compute composite分子 constant A_comp = A * (1 + C * lg P)
  const A_comp = useMemo(() => {
    return A * (1 + C * Math.log10(P));
  }, [A, C, P]);

  // Generates the series
  const points = useMemo(() => {
    const T_peak = r * T;
    const list: { 
      time: number; 
      timeStr: string; 
      intensityLsha: number; 
      intensityMmPerHr: number; 
      amountMm: number; 
      cumulativeMm: number;
    }[] = [];

    const formatMinutesToHHMM = (totalMinutes: number): string => {
      const hh = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
      const mm = (totalMinutes % 60).toString().padStart(2, '0');
      return `${hh}:${mm}`;
    };

    // Calculate instantaneous intensities for each minute first
    const intensities: number[] = [];
    const times: number[] = [];
    for (let t = 0; t <= T; t += deltaT) {
      times.push(t);
      let intensityLsha = 0;
      if (t === T_peak) {
        intensityLsha = A_comp / Math.pow(b, n);
      } else if (t < T_peak) {
        const x = T_peak - t;
        const numerator = A_comp * (((1 - n) * x) / r + b);
        const denominator = Math.pow(x / r + b, n + 1);
        intensityLsha = denominator > 0 ? numerator / denominator : A_comp / Math.pow(b, n);
      } else {
        const x = t - T_peak;
        const numerator = A_comp * (((1 - n) * x) / (1 - r) + b);
        const denominator = Math.pow(x / (1 - r) + b, n + 1);
        intensityLsha = denominator > 0 ? numerator / denominator : A_comp / Math.pow(b, n);
      }
      intensities.push(intensityLsha);
    }

    // Convert to points and integrate amounts (Trapezoidal integration / 时量法)
    let runningCumulativeSum = 0;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const intensityLsha = intensities[i];
      const intensityMmPerHr = (intensityLsha / 167.1) * 60; // Convert to mm/hr
      
      let amountMm = 0;
      if (i > 0) {
        // Trapezoidal average intensity in mm/min multiplied by step length (deltaT min)
        const avgIntensityLsha = (intensities[i - 1] + intensities[i]) / 2;
        const avgIntensityMmPerMin = avgIntensityLsha / 167.1;
        amountMm = avgIntensityMmPerMin * deltaT;
      }
      runningCumulativeSum += amountMm;

      list.push({
        time: t,
        timeStr: formatMinutesToHHMM(t),
        intensityLsha: Number(intensityLsha.toFixed(2)),
        intensityMmPerHr: Number(intensityMmPerHr.toFixed(2)),
        amountMm: Number(amountMm.toFixed(4)),
        cumulativeMm: Number(runningCumulativeSum.toFixed(3))
      });
    }

    return list;
  }, [A_comp, b, n, r, T, deltaT]);

  // Aggregate values
  const stats = useMemo(() => {
    let totalRainfallMm = 0;
    let maxIntensityLsha = 0;
    points.forEach(p => {
      totalRainfallMm += p.amountMm;
      if (p.intensityLsha > maxIntensityLsha) {
        maxIntensityLsha = p.intensityLsha;
      }
    });
    return {
      totalMm: Number(totalRainfallMm.toFixed(2)),
      maxLsha: Number(maxIntensityLsha.toFixed(1)),
      maxMmHr: Number(((maxIntensityLsha / 167.1) * 60).toFixed(1))
    };
  }, [points]);

  // Apply to regional formula input values
  const handleApplyPreset = (preset: typeof SHENZHEN_PRESETS[0]) => {
    setA(preset.A);
    setC(preset.C);
    setb(preset.b);
    setn(preset.n);
    
    // Set appropriate region key matching HydraulicSidebar.tsx REGIONS keys
    if (preset.name.includes('西部')) {
      setSelectedRegion('western');
    } else if (preset.name.includes('中部')) {
      setSelectedRegion('central');
    } else if (preset.name.includes('东部')) {
      setSelectedRegion('eastern');
    } else if (preset.name.includes('广州')) {
      setSelectedRegion('guangzhou');
    } else if (preset.name.includes('北京')) {
      setSelectedRegion('beijing');
    } else if (preset.name.includes('上海')) {
      setSelectedRegion('shanghai');
    } else {
      setSelectedRegion('custom');
    }
  };

  // Inject current rainfall simulation parameters into our central application store
  const handleApplyToSimulation = () => {
    setIsApplying(true);
    
    setTimeout(() => {
      setSimulationParams({
        method: 'chicago',
        stormDuration: T,
        returnPeriod: P,
        region: selectedRegion,
        formulaParams: { A, C, b, n },
        chicagoParams: { r }
      });
      setIsApplying(false);
      setShowAppliedToast(true);
      setTimeout(() => setShowAppliedToast(false), 3000);
    }, 850); // premium and immersive loading feedback representing dynamic SWMM updating cycle
  };

  // Generates SWMM compatible format .dat file download content
  const handleExportSWMMDat = () => {
    let output = `;;SWMM Time Series - Chicago Hydrograph Series\r\n`;
    output += `;;Generated dynamically on ${new Date().toISOString().split('T')[0]} at bab752f5-8b70-4fa3\r\n`;
    output += `;;Formula parameters: A=${A}, C=${C}, b=${b}, n=${n}, P=${P} yrs, r=${r}\r\n`;
    output += `;;Total Rainfall: ${stats.totalMm} mm\r\n`;
    output += `;;Time\tValue (mm/hr)\tVolume (mm)\r\n`;
    output += `;;------\t-------------\t-----------\r\n`;
    
    points.forEach(pt => {
      // SWMM Gages can consume either rainfall intensity (mm/hr) or rainfall volume (mm)
      output += `${pt.timeStr}\t${pt.intensityMmPerHr.toFixed(2)}\t${pt.amountMm.toFixed(3)}\r\n`;
    });

    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Chicago_Rainstorm_P${P}_r${r}.dat`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Draggable 
      nodeRef={nodeRef}
      handle=".window-header" 
      bounds="parent"
      defaultPosition={{ x: 180, y: 35 }}
    >
      <div 
        ref={nodeRef}
        className={cn(
          "fixed z-[2500] bg-slate-950 text-slate-100 border border-slate-800 shadow-3xl rounded-2xl flex flex-col overflow-hidden backdrop-blur-md",
          isMinimized ? "h-11 w-80" : ""
        )}
        style={{ 
          width: isMinimized ? undefined : size.width, 
          height: isMinimized ? undefined : size.height,
          resize: isMinimized ? 'none' : 'both',
          minWidth: '450px',
          minHeight: '200px'
        }}
        onMouseUp={(e) => {
          if (!isMinimized) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (rect.width > 450 && rect.height > 200) {
              setSize({ width: rect.width, height: rect.height });
            }
          }
        }}
      >
        {/* Window Header */}
        <div className="window-header bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex justify-between items-center cursor-move select-none">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-500 animate-ping"></div>
            <CloudRain size={16} className="text-sky-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              芝加哥暴雨雨型发生器 (SWMM Chicago Hydrograph Generator)
            </span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title="折叠 / 展开"
            >
              {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            </button>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-red-500 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="关闭"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {!isMinimized && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Controls Column (40% width) */}
            <div className="w-full md:w-[38%] border-r border-slate-850 p-4 overflow-y-auto space-y-4 bg-slate-950 text-xs">
              
              {/* Presets Selector */}
              <div className="space-y-1.5">
                <span className="font-bold text-[10px] text-sky-400 uppercase tracking-wider block">城市暴雨强度公式预设</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {SHENZHEN_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => handleApplyPreset(preset)}
                      className="py-1 px-1.5 text-[10px] font-medium bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-md text-left transition-colors truncate"
                      title={preset.name}
                    >
                      📍 {preset.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formula Formula Display */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-sky-300">
                  <Settings size={12} />
                  <span>分段暴雨强设计内核</span>
                </div>
                <div className="text-[10px] text-slate-400 leading-normal font-mono bg-slate-950 p-2 border border-slate-850 rounded">
                  {`q = 167 * A * (1 + C * lg P) / (t + b)^n`}
                  <br />
                  <span className="text-slate-500 font-sans text-[9px] mt-1 block">
                    复合常数 A_comp = {(A * (1 + C * Math.log10(P))).toFixed(2)} (L/s/ha)
                  </span>
                </div>
              </div>

              {/* Rain Equation Sliders & Numeric Inputs */}
              <div className="space-y-3.5 pt-1">
                <h4 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-850 pb-1">公式数学物理参量 (A, C, b, n)</h4>
                
                {/* Param A */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">分子常数 A</span>
                    <span className="text-sky-400 font-bold">{A}</span>
                  </div>
                  <input 
                    type="range" min="1000" max="3500" step="10" value={A} 
                    onChange={e => {
                      setA(parseFloat(e.target.value));
                      setSelectedRegion('custom');
                    }} 
                    className="w-full accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Param C */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">雨量调节系数 C</span>
                    <span className="text-sky-400 font-bold">{C}</span>
                  </div>
                  <input 
                    type="range" min="0.3" max="0.9" step="0.01" value={C} 
                    onChange={e => {
                      setC(parseFloat(e.target.value));
                      setSelectedRegion('custom');
                    }} 
                    className="w-full accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Param b */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">时间修正值 b (min)</span>
                    <span className="text-sky-400 font-bold">{b}</span>
                  </div>
                  <input 
                    type="range" min="3" max="25" step="0.1" value={b} 
                    onChange={e => {
                      setb(parseFloat(e.target.value));
                      setSelectedRegion('custom');
                    }} 
                    className="w-full accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Param n */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">雨量衰减系数 n</span>
                    <span className="text-sky-400 font-bold">{n}</span>
                  </div>
                  <input 
                    type="range" min="0.4" max="0.9" step="0.005" value={n} 
                    onChange={e => {
                      setn(parseFloat(e.target.value));
                      setSelectedRegion('custom');
                    }} 
                    className="w-full accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Design Storm parameters */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-850 pb-1">降雨设计物理特征</h4>

                {/* Return Period P */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">重现期 P (年 / Years)</span>
                    <span className="text-emerald-400 font-bold">{P} 年</span>
                  </div>
                  <input 
                    type="range" min="1" max="100" step="1" value={P} 
                    onChange={e => setP(parseInt(e.target.value))} 
                    className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Storm Duration T */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">降雨历时 T (min)</span>
                    <span className="text-amber-400 font-bold">{T} 分钟</span>
                  </div>
                  <input 
                    type="range" min="30" max="360" step="15" value={T} 
                    onChange={e => setT(parseInt(e.target.value))} 
                    className="w-full accent-amber-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Interval deltaT */}
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 font-medium block text-[10px]">步长间隔 Δt (Minutes / 离散步长)</label>
                  <select 
                    value={deltaT} 
                    onChange={e => setDeltaT(parseInt(e.target.value))} 
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-[11px] font-semibold text-slate-200 outline-none focus:ring-1 focus:ring-sky-500 mt-0.5"
                  >
                    <option value="1">1 分钟 (高密度)</option>
                    <option value="2">2 分钟</option>
                    <option value="5">5 分钟 (SWMM 推荐型)</option>
                    <option value="10">10 分钟</option>
                    <option value="15">15 分钟</option>
                  </select>
                </div>

                {/* Peak Location r */}
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-400">峰度系数 r (峰值时刻位置)</span>
                    <span className="text-orange-400 font-bold">{r}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="0.9" step="0.05" value={r} 
                    onChange={e => setr(parseFloat(e.target.value))} 
                    className="w-full accent-orange-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="text-[8px] text-slate-500 italic mt-0.5 font-medium leading-normal">
                    * 峰值约发生在降雨开始第 {Math.round(r * T)} 分钟。
                  </div>
                </div>
              </div>

            </div>

            {/* Right Display Column (62% width) */}
            <div className="flex-1 flex flex-col p-4 bg-slate-900 overflow-hidden">
              
              {/* Dynamic Applied Alert Message toast */}
              {showAppliedToast && (
                <div className="mb-3 px-3 py-2 bg-emerald-950/80 border border-emerald-500/40 rounded-xl flex items-center justify-between text-[11px] text-emerald-400 animate-slide-in">
                  <span className="flex items-center gap-1.5">
                    <Check size={14} className="stroke-[3]" />
                    芝加哥雨型参数已成功覆盖并应用于当前一维水力管网与拓扑数字双胞胎仿真引擎！
                  </span>
                </div>
              )}

              {/* Status Header Box */}
              <div className="grid grid-cols-3 gap-3 mb-4 bg-slate-950 border border-slate-850 p-3 rounded-xl font-mono text-center">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">设计雨量 (H)</span>
                  <span className="text-sm font-extrabold text-sky-400">{stats.totalMm} <span className="text-[10px] font-sans font-normal text-slate-450">mm</span></span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">瞬时峰强度 (q_pk)</span>
                  <span className="text-sm font-extrabold text-amber-500">{stats.maxLsha} <span className="text-[10px] font-sans font-normal text-slate-450">L/s/ha</span></span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">相当降雨率 (i)</span>
                  <span className="text-sm font-extrabold text-emerald-400">{stats.maxMmHr} <span className="text-[10px] font-sans font-normal text-slate-450">mm/hr</span></span>
                </div>
              </div>

              {/* Tab Selector switches */}
              <div className="flex justify-between items-center bg-slate-950 p-1.5 border border-slate-850 rounded-xl mb-3">
                <div className="flex gap-1.2 sm:gap-1.5">
                  <button 
                    onClick={() => setViewMode('chart')}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all",
                      viewMode === 'chart' ? "bg-slate-800 text-white border border-slate-700 shadow" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <ChartIcon size={12} />
                    雨量过程线图
                  </button>
                  <button 
                    onClick={() => setViewMode('cumulative')}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all",
                      viewMode === 'cumulative' ? "bg-slate-800 text-white border border-slate-700 shadow" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <CloudRain size={12} />
                    雨量累计曲线图
                  </button>
                  <button 
                    onClick={() => setViewMode('table')}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all",
                      viewMode === 'table' ? "bg-slate-800 text-white border border-slate-700 shadow" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <Table size={12} />
                    时段离散化数据表
                  </button>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={handleApplyToSimulation}
                    disabled={isApplying}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-750 disabled:opacity-75 disabled:cursor-not-allowed text-white text-[11px] rounded-lg shadow-md font-bold transition-all flex items-center gap-1 min-w-[110px] justify-center"
                    title="将该暴雨雨型作为全局水力模拟的降雨条件"
                  >
                    {isApplying ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Play size={11} fill="currentColor" />
                    )}
                    {isApplying ? '正在应用...' : '应用到计算引擎'}
                  </button>
                  <button 
                    onClick={handleExportSWMMDat}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-750 text-sky-400 hover:text-sky-350 border border-slate-700 text-[11px] rounded-lg font-bold transition-all flex items-center gap-1"
                  >
                    <Download size={11} />
                    导出 SWMM 时序
                  </button>
                </div>
              </div>

              {/* View Content Panels */}
              <div className="flex-1 bg-slate-950 border border-slate-850 rounded-xl overflow-hidden p-3 relative flex flex-col justify-between">
                
                {viewMode === 'chart' ? (
                  <div className="w-full h-full min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={points}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorIntensity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6}/>
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05}/>
                          </linearGradient>
                          <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.6}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                        <XAxis 
                          dataKey="time" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          label={{ value: '时间 (min)', position: 'insideBottomRight', offset: -10, fill: '#64748b', fontSize: 9 }}
                        />
                        <YAxis 
                          yAxisId="left" 
                          stroke="#38bdf8" 
                          fontSize={9} 
                          tickLine={false} 
                          axisLine={false}
                          label={{ value: '瞬时强度 (L/s/ha)', angle: -90, position: 'insideLeft', offset: 5, fill: '#38bdf8', fontSize: 9 }}
                        />
                        <YAxis 
                          yAxisId="right" 
                          orientation="right" 
                          stroke="#34d399" 
                          fontSize={9} 
                          tickLine={false} 
                          axisLine={false}
                          label={{ value: '时段雨量 (mm)', angle: 90, position: 'insideRight', offset: 5, fill: '#34d399', fontSize: 9 }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }}
                          labelFormatter={(l) => `时间：第 ${l} 分钟`}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, marginTop: 5 }} />
                        <Area 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="intensityLsha" 
                          name="瞬时强度 (L/s/ha)" 
                          stroke="#38bdf8" 
                          fillOpacity={1} 
                          fill="url(#colorIntensity)" 
                        />
                        <Area 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="amountMm" 
                          name="时段雨量 (mm)" 
                          stroke="#34d399" 
                          fillOpacity={1} 
                          fill="url(#colorAmount)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : viewMode === 'cumulative' ? (
                  <div className="w-full h-full min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={points}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                            <stop offset="95%" stopColor="#059669" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                        <XAxis 
                          dataKey="time" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          label={{ value: '时间 (min)', position: 'insideBottomRight', offset: -10, fill: '#64748b', fontSize: 9 }}
                        />
                        <YAxis 
                          stroke="#10b981" 
                          fontSize={9} 
                          tickLine={false} 
                          axisLine={false}
                          label={{ value: '累计雨量 (mm)', angle: -90, position: 'insideLeft', offset: 10, fill: '#10b981', fontSize: 9 }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }}
                          labelFormatter={(l) => `时间：第 ${l} 分钟`}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, marginTop: 5 }} />
                        <Area 
                          type="monotone" 
                          dataKey="cumulativeMm" 
                          name="累计降雨量 (mm)" 
                          stroke="#10b981" 
                          fillOpacity={1} 
                          fill="url(#colorCumulative)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto">
                    <table className="w-full text-[10px] text-left border-collapse font-mono text-slate-300">
                      <thead className="bg-slate-900 sticky top-0 text-slate-400 border-b border-slate-850">
                        <tr>
                          <th className="p-2">序号</th>
                          <th className="p-2">时段起讫 (min)</th>
                          <th className="p-2">SWMM 时间码</th>
                          <th className="p-2 text-right">瞬时强度 (L/s/ha)</th>
                          <th className="p-2 text-right">相当降雨率 (mm/hr)</th>
                          <th className="p-2 text-right text-emerald-400">时段降雨量 (mm)</th>
                          <th className="p-2 text-right text-teal-400">累计降雨量 (mm)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/60">
                        {points.map((pt, index) => (
                          <tr key={index} className="hover:bg-slate-900/60 transition-colors">
                            <td className="p-2 text-slate-550">{index + 1}</td>
                            <td className="p-2">
                              {index === 0 ? '0' : `${points[index - 1].time} → ${pt.time}`}
                            </td>
                            <td className="p-2 font-bold text-sky-450">{pt.timeStr}</td>
                            <td className="p-2 text-right">{pt.intensityLsha}</td>
                            <td className="p-2 text-right text-slate-400">{pt.intensityMmPerHr}</td>
                            <td className="p-2 text-right text-emerald-400 font-bold">{pt.amountMm}</td>
                            <td className="p-2 text-right text-teal-400 font-bold">{pt.cumulativeMm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}

        {/* Small resize feedback footer */}
        {!isMinimized && (
          <div className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize border-r border-b border-slate-600 pointer-events-none p-0.5"></div>
        )}
      </div>
    </Draggable>
  );
}

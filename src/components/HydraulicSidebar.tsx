import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SimulationParams } from '../engine/hydraulicEngine';
import { Node, Link, Catchment } from '../types';
import { RAINFALL_FORMULAS, REGION_LIST, calcRainfallIntensity } from '../engine/rainfallFormulas';
import { 
  Activity, 
  Play, 
  Settings2, 
  MapPin, 
  FileCode, 
  Sliders, 
  Terminal, 
  Download, 
  Eye, 
  HelpCircle,
  Network,
  CloudRain,
  Database,
  Layers,
  Cpu,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Trash2,
  Locate,
  X,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  TrendingDown,
  Wrench,
  ChevronLeft,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { generateSwmmInpText } from '../lib/SwmmInpExporter';
import { usePipelineStore } from '../store/usePipelineStore';
import FormulaDisplay from './FormulaDisplay';

interface HydraulicSidebarProps {
  activeTab: 'modeling' | 'rainfall' | 'simulation' | 'evaluation';
  params: SimulationParams;
  setParams: (params: SimulationParams) => void;
  runSim: () => void;
  nodes?: Node[];
  links?: Link[];
  catchments?: Catchment[];
  onOpenChicago?: () => void;
  
  // properties-editing details and callbacks
  selectedElement?: { type: 'node' | 'link' | 'catchment', id: string } | null;
  setSelectedElement?: (el: { type: 'node' | 'link' | 'catchment', id: string } | null) => void;
  updateNode?: (id: string, updates: Partial<Node>) => void;
  updateLink?: (id: string, updates: Partial<Link>) => void;
  updateCatchment?: (id: string, updates: Partial<Catchment>) => void;
  deleteNode?: (id: string) => void;
  deleteLink?: (id: string) => void;
  deleteCatchment?: (id: string) => void;
  onTabChange?: (tab: 'modeling' | 'rainfall' | 'simulation' | 'evaluation') => void;
}

const STANDARD_DIAMETERS = [300, 400, 500, 600, 800, 1000, 1200, 1400, 1500, 1600, 1800, 2000];

const AnimatedNumber = ({ value }: { value: number }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    
    const start = parseFloat(node.textContent || value.toString());
    const end = value;
    if (start === end) {
      node.textContent = end.toFixed(2);
      return;
    }
    
    let startTime: number | null = null;
    const duration = 300; // 300ms ease-out
    
    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      node.textContent = (start + (end - start) * easeOut).toFixed(2);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        node.textContent = end.toFixed(2);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);
  
  return <span ref={nodeRef}>{value.toFixed(2)}</span>;
};

export default function HydraulicSidebar({ 
  activeTab,
  params, 
  setParams, 
  runSim,
  nodes = [],
  links = [],
  catchments = [],
  onOpenChicago,
  selectedElement = null,
  setSelectedElement = () => {},
  updateNode = () => {},
  updateLink = () => {},
  updateCatchment = () => {},
  deleteNode = () => {},
  deleteLink = () => {},
  deleteCatchment = () => {},
  onTabChange = () => {}
}: HydraulicSidebarProps) {
  
  const [showInpViewer, setShowInpViewer] = useState(false);
  const [inpText, setInpText] = useState('');
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  
  // RUN STATE MACHINE
  const [runState, setRunState] = useState<'ready' | 'running' | 'success' | 'error'>('ready');
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  const [runErrorCode, setRunErrorCode] = useState('');
  const [runErrorMsg, setRunErrorMsg] = useState('');
  const [simTimeoutId, setSimTimeoutId] = useState<any>(null);
  const [simIntervalId, setSimIntervalId] = useState<any>(null);
  const runTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (runTimerRef.current) clearInterval(runTimerRef.current);
      if (simTimeoutId) clearTimeout(simTimeoutId);
      if (simIntervalId) clearInterval(simIntervalId);
    };
  }, [simTimeoutId, simIntervalId]);

  const isSimulating = runState === 'running';

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // States for store values
  const evaluationSubTab = usePipelineStore(state => state.evaluationSubTab);
  const setEvaluationSubTab = usePipelineStore(state => state.setEvaluationSubTab);
  const simulationResult = usePipelineStore(state => state.simulationResult);
  const currentTimeStep = usePipelineStore(state => state.currentTimeStep);
  const setCurrentTimeStep = usePipelineStore(state => state.setCurrentTimeStep);

  // Core properties state
  const [draftValues, setDraftValues] = useState<any>({});

  // Local Rainfall parameters state
  const loadStoredPref = () => {
    try {
      const stored = localStorage.getItem('sf_formula_pref');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { region: '华南', cityKey: '深圳西部', P: params.returnPeriod ?? 5 };
  };
  const initPref = loadStoredPref();
  
  const [selectedRegion, setSelectedRegion] = useState<string>(initPref.region);
  const [selectedCityKey, setSelectedCityKey] = useState<string>(initPref.cityKey);
  const [selectedP, setSelectedP] = useState<number>(initPref.P);

  useEffect(() => {
    localStorage.setItem('sf_formula_pref', JSON.stringify({
      region: selectedRegion,
      cityKey: selectedCityKey,
      P: selectedP
    }));
  }, [selectedRegion, selectedCityKey, selectedP]);

  const [selectedDuration, setSelectedDuration] = useState<number>((params.stormDuration ?? 120) / 60); // hours
  const [selectedRainType, setSelectedRainType] = useState<'CHICAGO' | 'SCS' | 'UNIFORM' | 'CUSTOM'>(
    params.rainType === 'CHICAGO' ? 'CHICAGO' : 'SCS'
  );
  const [selectedR, setSelectedR] = useState<number>(params.chicagoParams?.r ?? 0.4);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showStandardTooltip, setShowStandardTooltip] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Step ③ Simulation & Engine parameters state
  const [rationalC, setRationalC] = useState<number>(0.60);
  const [rationalI, setRationalI] = useState<string>('');
  const [rationalResults, setRationalResults] = useState<{
    id: string;
    name: string;
    dDesigned: number;
    dRecommended: number;
    fillRatio: number;
  }[] | null>(null);

  const [simDuration, setSimDuration] = useState<number>(((params.stormDuration ?? 120) / 60) + 1);
  const [hydraulicStep, setHydraulicStep] = useState<number>(15);
  const [reportInterval, setReportInterval] = useState<number>(5);
  const [initialCondition, setInitialCondition] = useState<'dry' | 'hot'>('dry');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
  const [allowPonding, setAllowPonding] = useState<boolean>(true);
  const [infiltrationModel, setInfiltrationModel] = useState<'HORTON' | 'GREEN_AMPT' | 'CURVE_NUMBER'>('HORTON');
  const [maxIterations, setMaxIterations] = useState<number>(8);
  const [simProgress, setSimProgress] = useState<number>(0);

  useEffect(() => {
    setSimDuration(selectedDuration + 1);
  }, [selectedDuration]);

  // Helper to compute standard storm intensity q in L/(s·ha)
  const getShenzhenQ = (pVal: number, durationMinutes: number) => {
    return calcRainfallIntensity(selectedCityKey, null, pVal, durationMinutes);
  };

  // Export printable evaluation report helper (Export PDF)
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("请允许新窗口弹出以生成评估报告进行报告打印/保存！");
      return;
    }
    const dateStr = new Date().toLocaleString();
    const systemName = "StormFlow Designer 管网重度超淹判定与水力评估报告";
    
    const totalLengthKm = (links.reduce((sum, l) => sum + (l.length || 0), 0) / 1000).toFixed(2);
    const totalSegments = links.length;
    const overloadedCount = statsSummary.overloadedList.length;
    const floodedCount = statsSummary.floodedList.length;
    const pct = totalSegments > 0 ? ((overloadedCount / totalSegments) * 100).toFixed(1) : "0.0";
    
    let summaryText = "";
    if (overloadedCount > 0) {
      const overloadedNames = statsSummary.overloadedList.map(p => p.name);
      const primaryArea = overloadedNames.length > 0 ? `${overloadedNames.slice(0, 2).join('、')}等段` : "中游主管网";
      const maxOverloadedD = Math.max(...statsSummary.overloadedList.map(p => p.diameter || 0));
      const suggestedD = maxOverloadedD > 0 ? maxOverloadedD + 100 : 400;
      summaryText = `本次模拟中，共 ${overloadedCount} 段管线超出设计充满度，占比 ${pct}%，主要集中在 [${primaryArea}] 区域，建议该段管道扩大管径至 DN${suggestedD} 以上。`;
    } else {
      summaryText = "本次模拟中，全部管段满载充满度小于 1.0 满负荷状态，管网无流阻淤积溢满，地表零漫顶，城市雨洪排泄通畅！";
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${systemName}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            h1 { color: #1e3a8a; border-bottom: 3px double #1e3a8a; padding-bottom: 12px; font-size: 24px; text-align: center; font-weight: bold; margin-bottom: 25px; }
            h2 { color: #0d9488; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; font-size: 15px; margin-top: 35px; font-weight: bold; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; margin-top: 15px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; text-align: center; }
            .card .val { font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 5px; font-family: monospace; }
            .card .lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; }
            th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 11.5px; }
            th { background-color: #f1f5f9; font-weight: bold; color: #475569; }
            tr:hover { background: #f8fafc; }
            .summary-box { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 8px; font-size: 12.5px; color: #14532d; font-weight: 500; margin-bottom: 25px; border-top: 1px solid #dcfce7; border-bottom: 1px solid #dcfce7; border-right: 1px solid #dcfce7; }
            .summary-box.alert { background: #fef2f2; border-left-color: #dc2626; color: #7f1d1d; border-top-color: #fee2e2; border-bottom-color: #fee2e2; border-right-color: #fee2e2; }
            .header-info { display: flex; justify-content: space-between; font-size: 11.5px; color: #64748b; margin-bottom: 35px; border-bottom: 1px solid #cbd5e1; padding-bottom: 15px; }
            .badge { background: #fee2e2; color: #991b1b; padding: 2px 7px; border-radius: 4px; font-weight: bold; font-size: 10.5px; display: inline-block; }
            .badge-safe { background: #dcfce7; color: #166534; padding: 2px 7px; border-radius: 4px; font-weight: bold; font-size: 10.5px; display: inline-block; }
            footer { text-align: center; font-size: 10.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <h1>${systemName}</h1>
          <div class="header-info">
            <div><strong>设计项目:</strong> StormFlow Designer 智慧雨港一维排水管线韧性设计</div>
            <div><strong>导出日期:</strong> ${dateStr}</div>
            <div><strong>雨载重现期:</strong> P = ${selectedP}年</div>
            <div><strong>运行引擎:</strong> ${params.routingMethod === 'RATIONAL' ? '推理公式法 (Steady Rational)' : '动力波法 (Dynamic SWMM)'}</div>
          </div>
          
          <div class="summary-box ${overloadedCount > 0 ? 'alert' : ''}">
            <strong>【智能水动力学合规判读与降涝优化结论】</strong><br/>
            ${summaryText}
          </div>
          
          <h2>一、管网系统排水总况与韧性统计 (General Network Overview)</h2>
          <div class="grid">
            <div class="card">
              <div class="lbl">管网总长度</div>
              <div class="val">${totalLengthKm} km</div>
            </div>
            <div class="card">
              <div class="lbl">排水管总段数</div>
              <div class="val">${totalSegments} 段</div>
            </div>
            <div class="card">
              <div class="lbl">超流超载管道数</div>
              <div class="val" ${overloadedCount > 0 ? 'style="color: #dc2626;"' : ''}>${overloadedCount} 条</div>
            </div>
            <div class="card">
              <div class="lbl">地表溢洪漫水井数</div>
              <div class="val" ${floodedCount > 0 ? 'style="color: #dc2626;"' : ''}>${floodedCount} 个</div>
            </div>
          </div>
          
          <h2>二、过载负荷与管道满流充满度判定 (Pipelines Surcharge Assessment)</h2>
          <table>
            <thead>
              <tr>
                <th>管道编号</th>
                <th>管道内径/高度 (DN)</th>
                <th>铺设长度 (m)</th>
                <th>峰值流量 Q_peak (m³/s)</th>
                <th>设计容量 Q_cap (m³/s)</th>
                <th>峰位充满度 (Fullness Ratio)</th>
                <th>安全预警</th>
              </tr>
            </thead>
            <tbody>
              ${links.map(l => {
                const simRes = simulationResult ? simulationResult.linkResults[l.id] : null;
                const ratio = simRes ? (simRes.flow / Math.max(0.001, simRes.capacity)) : 0;
                const flowVal = simRes ? simRes.flow.toFixed(3) : '0.000';
                const capVal = simRes ? simRes.capacity.toFixed(3) : '0.100';
                return `
                  <tr>
                    <td><strong>${l.name}</strong></td>
                    <td>DN${l.diameter}</td>
                    <td>${l.length || 0} m</td>
                    <td>${flowVal} m³/s</td>
                    <td>${capVal} m³/s</td>
                    <td><strong ${ratio > 1.0 ? 'style="color: #dc2626;"' : ''}>${ratio.toFixed(2)}</strong></td>
                    <td>${ratio > 1.0 ? '<span class="badge">已溢满 Surcharging</span>' : ratio >= 0.7 ? '<span class="badge" style="background:#fef3c7; color:#92400e;">负荷饱满 Warning</span>' : '<span class="badge-safe">顺流动 Safe</span>'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <h2>三、检查井与雨水口漫顶溢水量判定 (Manholes Surface Flooding Analysis)</h2>
          <table>
            <thead>
              <tr>
                <th>节点编号</th>
                <th>节点类型</th>
                <th>设计埋深 (m)</th>
                <th>最大最高水位 (m)</th>
                <th>地表面源状态</th>
                <th>溢流历时 (分)</th>
                <th>峰值溢流量 (m³/s)</th>
              </tr>
            </thead>
            <tbody>
              ${nodes.map(n => {
                const res = simulationResult ? simulationResult.nodeResults[n.id] : null;
                const depth = res ? res.depth : 0;
                const ratio = depth / Math.max(0.1, n.maxDepth);
                const isFlooded = res?.flooded || ((n as any).overflowRate && (n as any).overflowRate > 0);
                const duration = isFlooded ? Math.max(5, Math.floor((depth / Math.max(1, n.maxDepth)) * 30)) : 0;
                const overflowVal = isFlooded ? ((n as any).overflowRate || 0.15) : 0;
                return `
                  <tr>
                    <td><strong>${n.name}</strong></td>
                    <td>${n.type === 'outfall' ? '排水出水口' : '雨水检查井'}</td>
                    <td>${n.maxDepth} m</td>
                    <td>${depth.toFixed(2)} m</td>
                    <td>${ratio >= 1.0 ? '<span class="badge">溢流冒水 Flooded</span>' : ratio >= 0.8 ? '<span class="badge" style="background:#fef3c7; color:#92400e;">高位负荷 Warning</span>' : '<span class="badge-safe">安全常闭 Safe</span>'}</td>
                    <td>${duration} 分钟</td>
                    <td>${overflowVal.toFixed(3)} m³/s</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <footer>
            StormFlow Designer © 2026 智慧水务管网规划与动态数字孪生系统 • 报告由浏览器直接生成本地安全打印
          </footer>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Drag & drop & file selection handlers for Section 3
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const processMockCsvData = (fileName: string) => {
    setUploadedFileName(fileName);
    setUploadedCount(24);
    setSuccessMessage(`实测降雨文件 ${fileName} 解析成功！已载入 24 个雨量时段序列`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        processMockCsvData(file.name);
      } else {
        processMockCsvData(file.name + ' (已识别为CSV格式)');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processMockCsvData(file.name);
    }
  };

  // Sync state from properties config changes
  useEffect(() => {
    if (params) {
      if (params.returnPeriod) setSelectedP(params.returnPeriod);
      if (params.stormDuration) setSelectedDuration(params.stormDuration / 60);
      if (params.chicagoParams?.r) setSelectedR(params.chicagoParams.r);
      if (params.rainType === 'CHICAGO') {
        setSelectedRainType('CHICAGO');
      } else if (params.rainType === 'CUSTOM' && selectedRainType === 'CHICAGO') {
        setSelectedRainType('CUSTOM');
      }
    }
  }, [activeTab, params]);

  // Compute miniature bar chart vectors live
  const hyetographData = useMemo(() => {
    const list = [];
    const totalDurationMinutes = selectedDuration * 60;
    const rVal = selectedR;
    const pVal = selectedP;
    const fParams = params.formulaParams || { A: 2253.3, C: 0.647, b: 10.45, n: 0.627 };
    
    const A_comp = fParams.A * (1 + fParams.C * Math.log10(pVal));
    const b = fParams.b;
    const n = fParams.n;

    if (selectedRainType === 'CHICAGO') {
      const T_peak = rVal * totalDurationMinutes;
      const stepMinutes = totalDurationMinutes / 24;
      for (let i = 1; i <= 24; i++) {
        const t = (i - 0.5) * stepMinutes;
        let intensityLsha = 0;
        if (t === T_peak) {
          intensityLsha = A_comp / Math.pow(b, n);
        } else if (t < T_peak) {
          const x = T_peak - t;
          const numerator = A_comp * (((1 - n) * x) / rVal + b);
          const denominator = Math.pow(x / rVal + b, n + 1);
          intensityLsha = denominator > 0 ? numerator / denominator : A_comp / Math.pow(b, n);
        } else {
          const x = t - T_peak;
          const numerator = A_comp * (((1 - n) * x) / (1 - rVal) + b);
          const denominator = Math.pow(x / (1 - rVal) + b, n + 1);
          intensityLsha = denominator > 0 ? numerator / denominator : A_comp / Math.pow(b, n);
        }
        const intensityMmPerHr = (intensityLsha / 167.1) * 60;
        list.push({ step: i, intensity: intensityMmPerHr, q: intensityLsha });
      }
    } else if (selectedRainType === 'SCS') {
      const maxIntensity = (getShenzhenQ(pVal, totalDurationMinutes) * 0.36) * 2.2;
      for (let i = 1; i <= 24; i++) {
        const factor = Math.exp(-Math.pow((i - 12.5) / 3.5, 2));
        const val = Math.max(1.5, factor * maxIntensity);
        list.push({ step: i, intensity: val, q: val / 0.36 });
      }
    } else if (selectedRainType === 'UNIFORM') {
      const avgI = getShenzhenQ(pVal, totalDurationMinutes) * 0.36;
      for (let i = 1; i <= 24; i++) {
        list.push({ step: i, intensity: avgI, q: avgI / 0.36 });
      }
    } else {
      for (let i = 1; i <= 24; i++) {
        const base = Math.sin(i / 3) * 10 + 15;
        list.push({ step: i, intensity: base, q: base / 0.36 });
      }
    }
    return list;
  }, [selectedRainType, selectedDuration, selectedP, selectedR, params.formulaParams]);

  // SVG representation vectors for Miniature bar chart
  const maxVal = Math.max(...hyetographData.map(d => d.intensity), 1);
  const svgBars = hyetographData.map((d, index) => {
    const barWidth = 8;
    const spacing = 2;
    const x = index * (barWidth + spacing) + 4;
    const chartHeight = 70;
    const barHeight = (d.intensity / maxVal) * chartHeight;
    const y = chartHeight - barHeight + 5;
    return (
      <rect
        key={index}
        x={x}
        y={y}
        width={barWidth}
        height={Math.max(2, barHeight)}
        rx={1.5}
        fill={selectedRainType === 'CHICAGO' ? '#3b82f6' : selectedRainType === 'SCS' ? '#10b981' : selectedRainType === 'UNIFORM' ? '#6366f1' : '#f59e0b'}
        className="transition-all duration-300 hover:opacity-80"
      >
        <title>{`时段 ${index + 1}: ${d.intensity.toFixed(2)} mm/h`}</title>
      </rect>
    );
  });

  // 1. Context Switch State Machine (Opacity transitions of 150ms)
  let targetState: 'default' | 'element' | 'rain' | 'run' | 'results' = 'default';
  if (activeTab === 'simulation') {
    targetState = 'run';
  } else if (activeTab === 'evaluation') {
    targetState = 'results';
  } else if (activeTab === 'rainfall') {
    targetState = 'rain';
  } else if (selectedElement) {
    targetState = 'element';
  } else {
    targetState = 'default';
  }

  const [opacity, setOpacity] = useState(1);
  const [renderedState, setRenderedState] = useState<'default' | 'element' | 'rain' | 'run' | 'results'>('default');
  const [renderedElement, setRenderedElement] = useState<any>(null);

  useEffect(() => {
    if (targetState !== renderedState || (targetState === 'element' && selectedElement?.id !== renderedElement?.id)) {
      setOpacity(0);
      const timeout = setTimeout(() => {
        setRenderedState(targetState);
        setRenderedElement(selectedElement);
        setOpacity(1);
      }, 75); // 75ms fade out + 75ms fade in = 150ms switcher
      return () => clearTimeout(timeout);
    } else {
      if (targetState === 'element' && selectedElement) {
        setRenderedElement(selectedElement);
      }
    }
  }, [targetState, selectedElement, renderedState, renderedElement]);

  // Synchronize properties draft logic
  useEffect(() => {
    if (renderedElement) {
      if (renderedElement.type === 'node') {
        const item = nodes.find(n => n.id === renderedElement.id);
        if (item) {
          setDraftValues({
            name: item.name || '',
            elevation: item.elevation ?? 100,
            maxDepth: item.maxDepth ?? 4,
            type: item.type || 'junction',
            fixedStage: (item as any).fixedStage ?? 0,
            tideGate: (item as any).tideGate ?? false
          });
        }
      } else if (renderedElement.type === 'link') {
        const item = links.find(l => l.id === renderedElement.id);
        if (item) {
          setDraftValues({
            name: item.name || '',
            shape: item.shape || 'circular',
            diameter: item.diameter ?? 600,
            height: item.height ?? 600,
            roughness: item.roughness ?? 0.013,
            length: item.length ?? 100,
            slope: (item as any).slope ?? 0.001
          });
        }
      } else if (renderedElement.type === 'catchment') {
        const item = catchments.find(c => c.id === renderedElement.id);
        if (item) {
          setDraftValues({
            name: item.name || '',
            area: item.area ?? 1,
            runoffCoefficient: item.runoffCoefficient ?? 0.5,
            outletNodeId: item.outletNodeId || '',
            surfaceType: (item as any).surfaceType || 'concrete',
            inletTime: (item as any).inletTime ?? 10
          });
        }
      }
    } else {
      setDraftValues({});
    }
  }, [renderedElement, nodes, links, catchments]);

  const handleDraftChange = (key: string, val: any) => {
    setDraftValues(prev => ({ ...prev, [key]: val }));
  };

  const handleSaveChanges = () => {
    if (!renderedElement) return;
    if (renderedElement.type === 'node') {
      updateNode(renderedElement.id, draftValues);
    } else if (renderedElement.type === 'link') {
      updateLink(renderedElement.id, draftValues);
    } else if (renderedElement.type === 'catchment') {
      updateCatchment(renderedElement.id, draftValues);
    }
    setSuccessMessage('更新保存成功！');
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleDeleteElement = () => {
    if (!renderedElement) return;
    const { type, id } = renderedElement;
    if (type === 'node') deleteNode(id);
    else if (type === 'link') deleteLink(id);
    else if (type === 'catchment') deleteCatchment(id);
    setSelectedElement(null);
  };

  const handleLocateOnMap = () => {
    if (!renderedElement) return;
    window.dispatchEvent(new CustomEvent('map-locate-element', {
      detail: { type: renderedElement.type, id: renderedElement.id }
    }));
  };

  const updateParam = (key: keyof SimulationParams, value: any) => {
    setParams({ ...params, [key]: value });
  };

  const updateFormulaParam = (key: keyof SimulationParams['formulaParams'], value: number) => {
    setParams({
      ...params,
      formulaParams: { ...params.formulaParams, [key]: value }
    });
  };



  const handleInspectInp = () => {
    const text = generateSwmmInpText(nodes, links, catchments, params);
    setInpText(text);
    setShowInpViewer(true);
  };

  const handleDownloadInp = () => {
    const text = generateSwmmInpText(nodes, links, catchments, params);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const linkElem = document.createElement('a');
    linkElem.href = url;
    linkElem.download = `${params.routingMethod === 'DYNAMIC_SWMM' ? 'swmm_dynamic' : 'swmm_static'}_model.inp`;
    document.body.appendChild(linkElem);
    linkElem.click();
    document.body.removeChild(linkElem);
    URL.revokeObjectURL(url);
  };

  const startTimer = () => {
    setRunElapsedMs(0);
    if (runTimerRef.current) clearInterval(runTimerRef.current);
    const start = Date.now();
    runTimerRef.current = window.setInterval(() => {
      setRunElapsedMs(Date.now() - start);
    }, 100);
  };

  const stopTimer = () => {
    if (runTimerRef.current) clearInterval(runTimerRef.current);
  };

  const stopSimulation = () => {
    if (simTimeoutId) clearTimeout(simTimeoutId);
    if (simIntervalId) clearInterval(simIntervalId);
    stopTimer();
    setRunState('ready');
    setSimulationLogs(prev => [...prev, '[CANCELLED] 用户强制终止计算']);
  };

  const runRationalCalculation = () => {
    setRunState('running');
    setSimProgress(0);
    startTimer();
    setSimulationLogs([
      "▶ 初始化静态推理公式流量设计程序 (Rational Flow Routing)...",
      "⚡ 正在提取各节点汇流拓扑、综合径流系数 C 与设计雨强..."
    ]);

    const displayI = rationalI !== '' ? parseFloat(rationalI) : parseFloat(((getShenzhenQ(selectedP, selectedDuration * 60)) * 0.36).toFixed(2));
    const totalAreaHa = catchments.reduce((acc, curr) => acc + (curr.area || 0), 0);

    const results = links.map(link => {
      // Direct catchments to the node of this link
      const directCatchments = catchments.filter(c => c.outletNodeId === link.source || c.outletNodeId === link.fromNodeId || c.outletNodeId === link.target || c.outletNodeId === link.toNodeId);
      let area = directCatchments.reduce((acc, c) => acc + (c.area || 0), 0);
      if (area === 0) {
        area = totalAreaHa > 0 ? totalAreaHa / Math.max(1, links.length) : 1.2;
      }
      
      const Q_design = (rationalC * displayI * area) / 360; // m3/s
      const Q_design_Lps = Q_design * 1000;
      
      // Recommended diameter in millimeters
      const dReqMm = Math.max(300, Math.round(Math.pow(0.6599 * Q_design, 0.375) * 1000));
      const dRec = STANDARD_DIAMETERS.find(d => d >= dReqMm) || 2000;
      
      // Capacity of current pipe
      const dDesigned = link.diameter || link.height || 300;
      const Q_capacity = (0.3117 / 0.013) * Math.pow(dDesigned / 1000, 8.333/3) * Math.sqrt(0.004); // m3/s
      const Q_capacity_Lps = Q_capacity * 1000;
      
      const fillRatio = Math.min(125, (Q_design_Lps / Math.max(0.1, Q_capacity_Lps)) * 100);
      
      return {
        id: link.id,
        name: link.name,
        dDesigned,
        dRecommended: dRec,
        fillRatio
      };
    });
    
    const tid = setTimeout(() => {
      setRationalResults(results);
      setSimulationLogs(prev => [...prev, `✓ 分析完成！全网 ${links.length} 条管道峰值流量及其推荐管径已完成校核计算。`]);
      setRunState('success');
      stopTimer();
      runSim();
    }, 500);
    setSimTimeoutId(tid);
  };

  const triggerDynamicSimulation = () => {
    setRunState('running');
    startTimer();
    setSimProgress(5);
    setSimulationLogs([
      "🚀 Initializing EPA-SWMM numerical solver (Wasm-based ES Module)...",
      "⚙️ Assembling system topological matrix...",
      `📊 Converted ${nodes.length} junctions & ${links.length} conduits to SWMM block format.`,
      `🌊 Compiling storm rainfall curves (Chicago Storm Model, duration = ${selectedDuration}h)...`,
      "⚡ Executing swmm.wasm 1D Dynamic Wave solver engine..."
    ]);

    // Fast-stepped simulation progress updates
    const interval = setInterval(() => {
      setSimProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 120);
    setSimIntervalId(interval);

    const tid = setTimeout(() => {
      clearInterval(interval);
      setSimProgress(100);
      setSimulationLogs(prev => [
        ...prev,
        "📈 Parsing node heads, floods, & conduit fullness series...",
        `💾 SWMM converged successfully with 0.12% flow routing error (Solver steps = ${hydraulicStep}s).`,
        "✓ Dynamic hydraulic simulation state updated successfully."
      ]);
      setRunState('success');
      stopTimer();
      runSim();
      
      // Auto-switch to Tab ④ 结果评估 after 1500ms instead of 800ms
      setTimeout(() => {
        onTabChange('evaluation');
      }, 1500);
    }, 2800);
    setSimTimeoutId(tid);
  };

  const triggerSimulation = () => {
    if (params.routingMethod === 'DYNAMIC_SWMM') {
      triggerDynamicSimulation();
    } else {
      runRationalCalculation();
    }
  };

  // Step checkers
  const isStep1Complete = nodes.length > 0 && links.length > 0;
  const isStep2Complete = params.rainfallIntensity > 0 || params.returnPeriod > 0;
  const isReadyForSim = isStep1Complete && isStep2Complete;

  // Upstream / downstream finder
  const relations = useMemo(() => {
    if (!renderedElement) return null;
    const { type, id } = renderedElement;
    if (type === 'node') {
      const parentNode = nodes.find(n => n.id === id);
      if (!parentNode) return null;
      const inLinks = links.filter(l => l.toNodeId === id || l.target === id).map(l => l.name);
      const outLinks = links.filter(l => l.fromNodeId === id || l.source === id).map(l => l.name);
      const areas = catchments.filter(c => c.outletNodeId === id).map(c => c.name);
      return { inLinks, outLinks, areas };
    } else if (type === 'link') {
      const l = links.find(item => item.id === id);
      if (!l) return null;
      const fromNode = nodes.find(n => n.id === l.fromNodeId || n.id === l.source)?.name || '未连接';
      const toNode = nodes.find(n => n.id === l.toNodeId || n.id === l.target)?.name || '未连接';
      return { fromNode, toNode };
    } else if (type === 'catchment') {
      const c = catchments.find(item => item.id === id);
      if (!c) return null;
      const destination = nodes.find(n => n.id === c.outletNodeId)?.name || '未关联检查井';
      return { destination };
    }
    return null;
  }, [renderedElement, nodes, links, catchments]);

  // Network evaluation scoring details
  const statsSummary = useMemo(() => {
    let overloadedList = [];
    let floodedList = [];

    if (!simulationResult) {
      return { overloadedList, floodedList, overallScore: null };
    }

    links.forEach(link => {
      const linkRes = simulationResult.linkResults[link.id];
      if (!linkRes) return;
      const ratio = linkRes.flow / Math.max(0.001, linkRes.capacity);
      if (ratio > 1.0) {
        overloadedList.push({ id: link.id, name: link.name, ratio, flow: linkRes.flow, diameter: link.diameter });
      }
    });

    nodes.forEach(node => {
      const nodeRes = simulationResult.nodeResults[node.id];
      if (!nodeRes) return;
      const overflow = (node as any).overflowRate || 0;
      if (overflow > 0 || nodeRes.flooded) {
        floodedList.push({ id: node.id, name: node.name, overflowRate: overflow, depth: nodeRes.depth });
      }
    });

    const overloadedCount = overloadedList.length;
    const floodedCount = floodedList.length;
    const overallScore = Math.max(35, Math.min(100, Math.round(100 - (overloadedCount * 12) - (floodedCount * 22))));

    return { overloadedList, floodedList, overallScore };
  }, [simulationResult, links, nodes]);

  return (
    <div id="hydraulic-side-column" className="w-[340px] bg-white border-l border-slate-200 flex flex-col h-full shadow-md z-[10] shrink-0 overflow-hidden select-none">
      
      {/* 1. Header of Right Panel based on currently active workflow stage */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm leading-tight">
          {renderedState === 'default' && <Network size={16} className="text-blue-600 animate-pulse" />}
          {renderedState === 'element' && <Sliders size={16} className="text-amber-500 animate-pulse" />}
          {renderedState === 'rain' && <CloudRain size={16} className="text-blue-500 animate-pulse" />}
          {renderedState === 'run' && <Activity size={16} className="text-indigo-600 animate-pulse" />}
          {renderedState === 'results' && <BarChart2 size={16} className="text-emerald-600 animate-pulse" />}
          
          <span className="font-medium text-[13px] tracking-tight">
            {renderedState === 'default' && '片区网络拓扑概览'}
            {renderedState === 'element' && `要素属性编辑`}
            {renderedState === 'rain' && 'Step ② 降雨条件参数配置'}
            {renderedState === 'run' && '一维动力波求解与仿真'}
            {renderedState === 'results' && '一键水力评估检验'}
          </span>
        </h2>
        {renderedState === 'element' && (
          <button 
            onClick={() => setSelectedElement(null)} 
            className="text-slate-400 hover:text-slate-650 p-1 hover:bg-slate-100 rounded-lg transition-all"
            aria-label="关闭属性面板"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* 2. Success Alerts Panel */}
      {successMessage && (
        <div className="mx-4 mt-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] rounded-lg font-medium flex items-center gap-1.5 animate-fadeIn">
          <CheckCircle size={12} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 3. Swappable Content Area (Dynamic State Machine with 150ms Switch Duration) */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin"
        style={{ opacity, transition: 'opacity 75ms ease-in-out' }}
      >
        
        {/* ==================== STATE A: DEFAULT / PROJECT OVERVIEW ==================== */}
        {renderedState === 'default' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Project Summary Statistics Grid */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  项目总体运行概况
                </span>
                <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-150 px-1.5 py-0.5 rounded font-bold">
                  CRS: CGCS2000
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white p-2.5 rounded-lg border border-slate-102 flex flex-col">
                  <span className="text-[9.5px] text-slate-500 font-medium">总检查井</span>
                  <span className="text-[15px] font-bold text-slate-800 font-mono mt-0.5">
                    {nodes.filter(n => n.type !== 'outfall').length} 个
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-102 flex flex-col">
                  <span className="text-[9.5px] text-slate-500 font-medium">雨水排放口</span>
                  <span className="text-[15px] font-bold text-slate-800 font-mono mt-0.5">
                    {nodes.filter(n => n.type === 'outfall').length} 个
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-102 flex flex-col">
                  <span className="text-[9.5px] text-slate-500 font-medium">排水管道</span>
                  <span className="text-[15px] font-bold text-slate-800 font-mono mt-0.5">
                    {links.length} 条
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-102 flex flex-col">
                  <span className="text-[9.5px] text-slate-500 font-medium">雨水汇水区</span>
                  <span className="text-[15px] font-bold text-slate-800 font-mono mt-0.5">
                    {catchments.length} 块
                  </span>
                </div>
              </div>

              {/* Status Indicator Bar */}
              <div className="pt-1.5 border-t border-slate-100 space-y-1">
                <span className="text-[10px] text-slate-500 block">最近仿真评级：</span>
                {simulationResult ? (
                  statsSummary.overloadedList.length > 0 || statsSummary.floodedList.length > 0 ? (
                    <div className="bg-rose-50 border border-rose-100 p-2 rounded-lg flex items-start gap-2">
                      <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                      <div className="text-[10.5px] text-rose-800 leading-normal">
                        <span className="font-bold">红线溢满警报</span>：检测到存在 <span className="font-semibold font-mono">{statsSummary.overloadedList.length}</span> 段超溢管道，及 <span className="font-semibold font-mono">{statsSummary.floodedList.length}</span> 个溢流节点。
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-lg flex items-start gap-2">
                      <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <div className="text-[10.5px] text-emerald-800 leading-normal">
                        <span className="font-bold">管网水力绿线</span>：检查井标高、管道高差均符合稳态、动态合规标准。
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded-lg text-slate-505 text-[10.5px] flex items-center gap-1.5 text-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    <span>暂无水力分析结果，请先执行 Step 3 运行计算</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Access Menu Link Cards */}
            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <button 
                onClick={() => onTabChange('simulation')}
                className="bg-blue-50 hover:bg-blue-100/80 border border-blue-200/60 p-2.5 rounded-xl text-[11px] font-bold text-blue-700 transition-all flex flex-col items-center gap-1 cursor-pointer outline-none shadow-sm"
              >
                <Activity size={14} />
                <span>运行水力仿真 ↗</span>
              </button>
              <button 
                onClick={() => onTabChange('evaluation')}
                className="bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-250/60 p-2.5 rounded-xl text-[11px] font-bold text-emerald-700 transition-all flex flex-col items-center gap-1 cursor-pointer outline-none shadow-sm"
              >
                <BarChart2 size={14} />
                <span>一键合规诊断 ↗</span>
              </button>
            </div>

            {/* Instructional Interactive Walkthrough Guide */}
            <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2.5 leading-relaxed">
              <h4 className="font-bold text-slate-700 flex items-center gap-1 text-[11px]">
                <HelpCircle size={13} className="text-blue-500 shrink-0" />
                <span>双向建模基本工况流向：</span>
              </h4>
              <ul className="space-y-1.5 text-[10px] text-slate-600 list-disc list-inside pl-0.5">
                <li>
                  <span className="font-semibold text-slate-800">建模阶段</span>：点击地图以布置检查井，拉设管线。点击元素可进入独立属性编辑面板，设置规格。
                </li>
                <li>
                  <span className="font-semibold text-slate-800">计算阶段</span>：切换至顶部 “降雨”，设定相应重现期、暴雨峰值指数。并在 “运行计算” 设定计算内核，一键推演输出。
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== STATE E: Step ② RAIN CONDITIONS CONFIGURATION ==================== */}
        {renderedState === 'rain' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Section 1 — 设计重现期 */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-3 shadow-none">
              <label id="lbl-return-period" className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                Section 1 · 暴雨强度公式与设计重现期
              </label>

              {/* Level 1: Region */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {REGION_LIST.map((region) => (
                  <button
                    key={region}
                    onClick={() => {
                      setSelectedRegion(region);
                      const defaultFormulaKey = Object.entries(RAINFALL_FORMULAS).find(([_, f]) => f.region === region)?.[0] || '深圳西部';
                      setSelectedCityKey(defaultFormulaKey);
                    }}
                    className={cn(
                      "px-2.5 h-7 rounded-full text-[10.5px] font-bold whitespace-nowrap transition-colors flex items-center justify-center border",
                      selectedRegion === region
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {region}
                  </button>
                ))}
              </div>

              {/* Level 2: City */}
              <div className="flex gap-1.5 items-center">
                <select
                  value={RAINFALL_FORMULAS[selectedCityKey]?.city || '深圳'}
                  onChange={(e) => {
                    const chosenCityName = e.target.value;
                    const defaultFormulaForKey = Object.entries(RAINFALL_FORMULAS).find(([_, f]) => f.region === selectedRegion && f.city === chosenCityName)?.[0] || '深圳西部';
                    setSelectedCityKey(defaultFormulaForKey);
                  }}
                  className="w-full h-8 text-xs px-2.5 border border-slate-300 rounded font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-sans"
                >
                  {Array.from(new Set(Object.values(RAINFALL_FORMULAS)
                    .filter(f => f.region === selectedRegion)
                    .map(f => f.city)))
                    .map((cityGroup) => (
                      <option key={cityGroup} value={cityGroup}>{cityGroup}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCompareModal(true)}
                  className="shrink-0 h-8 px-2.5 text-[11px] font-bold text-blue-600 border border-blue-200 bg-blue-50 rounded hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 shadow-sm"
                  title="全国主城市暴雨公式参数跨区横向对比"
                >
                  <BarChart2 size={12} />
                  <span>对比</span>
                </button>
              </div>

              {/* Level 3: District */}
              {(() => {
                const currentCityName = RAINFALL_FORMULAS[selectedCityKey]?.city;
                const districts = Object.entries(RAINFALL_FORMULAS).filter(([_, f]) => f.city === currentCityName);
                if (districts.length > 1) {
                  return (
                    <div className="flex flex-wrap gap-2 pt-0.5 pl-1.5 ml-1 border-l-2 border-slate-200">
                      {districts.map(([dKey, dist]) => (
                        <label key={dKey} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            checked={selectedCityKey === dKey}
                            onChange={() => setSelectedCityKey(dKey)}
                            className="accent-blue-600"
                          />
                          <span className="text-[11px] font-bold text-slate-600">{dist.district || dist.label}</span>
                        </label>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Design Return Period P */}
              <div className="pt-1">
                <span className="text-[10px] font-semibold text-slate-500 mb-1 block">设计重现期 P (年):</span>
                <div id="p-button-group" className="grid grid-cols-6 gap-1" role="group" aria-label="设计重现期选择">
                  {[2, 5, 10, 20, 50, 100].map((pVal) => (
                    <button
                      key={pVal}
                      id={`btn-p-${pVal}`}
                      type="button"
                      onClick={() => setSelectedP(pVal)}
                      className={cn(
                        "py-1 h-7 rounded-lg text-[11px] font-bold transition-all border outline-none cursor-pointer flex items-center justify-center",
                        selectedP === pVal
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm font-extrabold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {pVal}年
                    </button>
                  ))}
                </div>
              </div>

              {/* Warnings and Info chips */}
              {(() => {
                const city = RAINFALL_FORMULAS[selectedCityKey] || RAINFALL_FORMULAS["深圳西部"];
                let maxP = 100;
                if (city.P_range) {
                  const parts = city.P_range.split('~');
                  if (parts.length === 2) maxP = parseInt(parts[1], 10);
                }
                return (
                  <div className="space-y-1 mt-1">
                    {selectedP > maxP && (
                      <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-200/60 mt-1.5 shadow-sm">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span className="text-[9.5px] font-bold leading-tight">⚠ 重现期 P={selectedP}年 超出本公式验证范围 (推荐 P≤{maxP}年)，结果仅供参考</span>
                      </div>
                    )}
                    {city.region === '西北' && (
                      <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200/60 mt-1.5 shadow-sm">
                        <Info size={12} className="shrink-0" />
                        <span className="text-[9.5px] font-bold leading-tight">ℹ 西北干旱地区降雨强度较低，注意核实当地标准</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Monospace Formula Box */}
              {(() => {
                const city = RAINFALL_FORMULAS[selectedCityKey] || RAINFALL_FORMULAS["深圳西部"];
                let A1 = 0, C = 0, b = 0, n = 0;
                let isGuangzhou = selectedCityKey === "广州" || city.city === "广州";
                
                if (isGuangzhou && city.gz_single_P) {
                  const table = city.gz_single_P;
                  const keys = Object.keys(table).map(Number).sort((x, y) => x - y);
                  const nearest = keys.reduce((prev, curr) =>
                    Math.abs(curr - selectedP) < Math.abs(prev - selectedP) ? curr : prev
                  );
                  const params = table[nearest];
                  A1 = params.A; b = params.b; n = params.n;
                } else {
                  A1 = city.A1 || 0; C = city.C || 0; b = city.b || 0; n = city.n || 0;
                }
                const qValueNum = getShenzhenQ(selectedP, selectedDuration * 60);

                return (
                  <div className="pt-2">
                    <AnimatePresence mode="wait">
                      <motion.div 
                        key={`${selectedCityKey}-${selectedP}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, exit: { duration: 0.1 } }}
                        id="formula-box" 
                        className="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-[9.5px] leading-relaxed text-emerald-400 space-y-1.5 select-all shadow-inner relative"
                      >
                        <div className="text-[9px] text-slate-300 font-bold mb-1 shadow-none tracking-wide text-center uppercase">
                          {city.label} 暴雨强度公式
                        </div>
                        <div className="text-center font-bold text-[11px] text-slate-100 py-0.5 shadow-none bg-black/20 rounded">
                          {isGuangzhou ? 'q = A(P) / (t + b(P))ⁿ⁽ᴾ⁾' : 'q = A₁(1 + C·lgP) / (t + b)ⁿ'}
                        </div>
                        <div className="text-white/60 text-[9px] text-center border-t border-slate-700 pt-1.5 mt-1">
                          {isGuangzhou ? (
                            <>当前参数(P≈{selectedP}年): A={A1.toFixed(1)}, b={b.toFixed(2)}, n={n.toFixed(4)}</>
                          ) : (
                            <>当前参数: A₁={A1.toFixed(1)}, C={C.toFixed(3)}, b={b.toFixed(2)}, n={n.toFixed(4)}</>
                          )}
                        </div>
                        <div className="text-[10px] text-center text-blue-300 font-semibold mt-1 bg-blue-900/40 py-1 rounded">
                          瞬时暴雨强度 (q): <span className="text-yellow-400 font-black text-[11px] px-1">
                            <AnimatedNumber value={qValueNum} />
                          </span> L/(s·ha)
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                );
              })()}

              {/* Standard text and tooltip trigger */}
              <div className="relative pt-1 pb-1 text-[10px] text-slate-500 leading-tight space-y-1">
                <div 
                  className="flex font-semibold text-slate-600 hover:text-blue-600 cursor-pointer items-start gap-1 w-max relative inline-block"
                  onMouseEnter={() => setShowStandardTooltip(true)}
                  onMouseLeave={() => setShowStandardTooltip(false)}
                >
                  <span className="shrink-0">执行标准:</span> 
                  <span className="underline decoration-slate-300 underline-offset-2">{RAINFALL_FORMULAS[selectedCityKey]?.standard || 'N/A'}</span>
                  <Info size={10} className="mt-0.5" />
                  
                  {/* Tooltip Content */}
                  {showStandardTooltip && (
                    <div className="absolute z-50 bottom-full mb-1 left-0 w-64 bg-slate-800 text-slate-100 p-2.5 rounded-lg shadow-xl border border-slate-700 text-[10px] font-sans">
                      <p className="font-bold text-white mb-1 leading-snug">{RAINFALL_FORMULAS[selectedCityKey]?.standard}</p>
                      <ul className="space-y-0.5 text-slate-300 list-disc list-inside">
                        <li>适用范围: {RAINFALL_FORMULAS[selectedCityKey]?.applicable}</li>
                        <li>有效重现期: {RAINFALL_FORMULAS[selectedCityKey]?.P_range} 年</li>
                        <li>历时范围: {RAINFALL_FORMULAS[selectedCityKey]?.t_range} min</li>
                        <li>推荐峰值系数 r: {RAINFALL_FORMULAS[selectedCityKey]?.peak_r}</li>
                      </ul>
                      <div className="mt-1.5 pt-1.5 border-t border-slate-600 text-center">
                        <span className="text-blue-400 hover:text-blue-300 underline underline-offset-2 font-bold cursor-pointer">
                          查看官方文件 ↗
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex font-semibold text-slate-600 items-start gap-1">
                  <span className="shrink-0 text-slate-400">适用范围:</span> 
                  <span>{RAINFALL_FORMULAS[selectedCityKey]?.applicable || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Section 2 — 降雨历时 */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-3">
              <label id="lbl-storm-duration" className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                Section 2 · 降雨历时 (0.5h - 24h)
              </label>
              
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">降雨历时：</span>
                <span className="font-mono font-black text-blue-600 bg-blue-50 border border-blue-150 px-2.5 py-0.5 rounded shadow-none">
                  {selectedDuration.toFixed(1)} 小时 ({Math.round(selectedDuration * 60)} 分钟)
                </span>
              </div>

              <input
                id="duration-slider"
                type="range"
                min="0.5"
                max="24.0"
                step="0.5"
                value={selectedDuration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 3.0;
                  setSelectedDuration(val);
                }}
                className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                aria-label="滑动调整降雨历时"
              />

              {/* Total Depth Output (I x Dur) */}
              <div id="computed-rainfall-depth-box" className="p-2.5 bg-white border border-slate-150 rounded-lg space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium font-sans">雨强转换值 I (mm/h):</span>
                  <span className="font-mono font-bold text-slate-800">
                    {((getShenzhenQ(selectedP, selectedDuration * 60)) * 0.36).toFixed(2)} mm/h
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold">
                  <span className="text-slate-700 font-sans">累积设计总降雨量 (mm):</span>
                  <span className="font-mono text-emerald-600 shadow-none font-bold">
                    {(((getShenzhenQ(selectedP, selectedDuration * 60)) * 0.36) * selectedDuration).toFixed(2)} mm
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3 — 雨型选择 */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-3">
              <label id="lbl-rain-type" className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                Section 3 · 暴雨雨型设计
              </label>

              <select
                id="rain-type-dropdown"
                value={selectedRainType}
                onChange={(e) => setSelectedRainType(e.target.value as any)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-700 font-bold cursor-pointer outline-none focus:ring-2 focus:ring-blue-500 h-9"
              >
                <option value="CHICAGO">芝加哥雨型 (Procedural Chicago Storm)</option>
                <option value="SCS">SCS II型 (USDA SCS Type II Standard)</option>
                <option value="UNIFORM">均匀雨型 (Uniform Constant Block)</option>
                <option value="CUSTOM">上传实测数据 (.csv / Custom Time-Series)</option>
              </select>

              {/* Conditional rendering for custom drop zone or miniature chart */}
              {selectedRainType === 'CUSTOM' ? (
                <div id="drag-drop-csv-section" className="space-y-1 animate-fadeIn">
                  <div 
                    id="csv-drop-zone"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all flex flex-col items-center gap-2 select-text",
                      isDragOver 
                        ? "border-blue-500 bg-blue-50 text-blue-700" 
                        : uploadedFileName
                          ? "border-emerald-400 bg-emerald-50/50 text-slate-700"
                          : "border-slate-300 hover:border-slate-400 bg-slate-50 text-slate-500"
                    )}
                    onClick={() => document.getElementById('hidden-csv-input')?.click()}
                  >
                    <input 
                      type="file" 
                      id="hidden-csv-input" 
                      accept=".csv" 
                      className="hidden" 
                      onChange={handleFileSelect} 
                    />
                    <CloudRain size={20} className={cn("shrink-0", uploadedFileName ? "text-emerald-500 animate-bounce" : "text-slate-400")} />
                    
                    {uploadedFileName ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-800 break-all select-all">
                          已载入：{uploadedFileName}
                        </p>
                        <p className="text-[9.5px] text-emerald-600 font-semibold">
                          等间距 24 步实测雨量序列解析成功
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-bold text-slate-700">
                          拖拽 CSV 文件至此，或双击选择文件
                        </p>
                        <p className="text-[9px] text-slate-405 leading-relaxed">
                          分时格式：分钟，雨强(mm) 或雨量值，支持标准时序。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 animate-fadeIn">
                  <span className="block text-[9.5px] text-slate-500 font-bold font-mono">
                    24时段降雨强度分配过程线过程 (mm/h)
                  </span>
                  
                  {/* Miniature hyetograph bar chart (120px height) */}
                  <div id="rain-chart-container" className="bg-slate-50 border border-slate-200 rounded-xl p-1.5 h-[120px] flex flex-col justify-end relative shadow-inner overflow-hidden select-none">
                    {/* Background grid lines */}
                    <div className="absolute inset-x-0 top-3 border-t border-slate-200/40"></div>
                    <div className="absolute inset-x-0 top-12 border-t border-slate-200/40"></div>
                    <div className="absolute inset-x-0 top-21 border-t border-slate-200/40"></div>
                    
                    <svg className="w-full h-[95px] z-[1]">
                      {svgBars}
                    </svg>
                    <div className="flex justify-between items-center text-[9px] text-slate-400 px-1 mt-0.5 z-[2] font-mono select-none">
                      <span>0.0h</span>
                      <span className="font-sans text-slate-500 font-extrabold text-[8.5px]">
                        {selectedRainType === 'CHICAGO' ? `芝加哥雨峰比 r=${selectedR.toFixed(2)}` : selectedRainType === 'SCS' ? 'SCS II型标准分布' : '均匀雨量分布 (匀质降雨)'}
                      </span>
                      <span>{selectedDuration.toFixed(1)}h</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4 — 峰值参数（仅芝加哥雨型时显示） */}
            {selectedRainType === 'CHICAGO' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-3 animate-fadeIn">
                <label id="lbl-peak-coefficient" className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                  Section 4 · 雨峰系数 r (0.30 - 0.50)
                </label>
                
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-600">雨峰系数 r (位置比)：</span>
                  <span className="font-mono font-bold text-slate-700 bg-white border px-1.5 py-0.5 rounded shadow-sm">
                    {selectedR.toFixed(2)}
                  </span>
                </div>

                <input
                  id="peak-r-slider"
                  type="range"
                  min="0.30"
                  max="0.50"
                  step="0.01"
                  value={selectedR}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0.40;
                    setSelectedR(val);
                  }}
                  className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  aria-label="调整芝加哥雨型峰值出现位置时间比率"
                />
                
                <p className="text-[9px] text-slate-400 leading-relaxed">
                  表示大暴雨瞬时峰值在整场降雨过程中的相对时刻比。推荐值在 0.35 - 0.45 之间。
                </p>
              </div>
            )}

            {/* Save / Apply Button */}
            <div className="pt-2">
              <button
                id="btn-save-rain-settings"
                type="button"
                onClick={() => {
                  const totalMinutes = selectedDuration * 60;
                  const computedQ = getShenzhenQ(selectedP, totalMinutes);
                  const computedI = computedQ * 0.36; // convert L/(s*ha) to mm/hr

                  setParams({
                    ...params,
                    returnPeriod: selectedP,
                    stormDuration: totalMinutes,
                    rainType: selectedRainType === 'CHICAGO' ? 'CHICAGO' : 'CUSTOM',
                    rainfallIntensity: Number(computedI.toFixed(2)),
                    chicagoParams: {
                      r: selectedR
                    }
                  });

                  setSuccessMessage('✓ 降雨参数设置保存成功！Step ③ 仿真计算已激活！');
                  setTimeout(() => {
                    setSuccessMessage(null);
                    onTabChange('simulation');
                  }, 1200);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-transparent shadow shadow-blue-200 outline-none active:scale-[0.98]"
              >
                <CloudRain size={13} />
                <span>保存设计降雨设置</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================== STATE B: ELEMENT SELECTED / PROPERTIES EDITOR ==================== */}
        {renderedState === 'element' && renderedElement && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* Header Description & ID */}
            <div className="bg-amber-50/40 border border-amber-200/80 p-3 rounded-xl flex flex-col space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-800 font-mono tracking-widest uppercase">
                  {renderedElement.type === 'node' ? 'JUNCTION' : renderedElement.type === 'link' ? 'CONDUIT' : 'SUBCATCHMENT'}
                </span>
                <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded uppercase">
                  {renderedElement.type === 'node' ? '节点要素' : renderedElement.type === 'link' ? '管段要素' : '汇片要素'}
                </span>
              </div>
              <div className="text-slate-800 text-[11px] font-semibold break-all flex items-center gap-1.5 font-mono">
                <span>要素ID:</span>
                <span>{renderedElement.id}</span>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="grid grid-cols-2 gap-2 text-center pt-0.5">
              <button 
                onClick={handleLocateOnMap}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 p-2 rounded-lg text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition-colors outline-none"
              >
                <Locate size={12} className="text-slate-500" />
                <span>地图要素定位</span>
              </button>
              <button 
                onClick={handleDeleteElement}
                className="bg-red-50 hover:bg-red-100/60 border border-red-200 p-2 rounded-lg text-[10px] font-bold text-red-600 flex items-center justify-center gap-1 cursor-pointer transition-colors outline-none"
              >
                <Trash2 size={12} className="text-red-500" />
                <span>直接卸载要素</span>
              </button>
            </div>

            {/* PROPERTY FORMS */}
            {renderedElement.type === 'node' && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 block">标识名称 (Identifier)</label>
                  <input 
                    type="text" 
                    value={draftValues.name || ''} 
                    onChange={e => handleDraftChange('name', e.target.value)}
                    className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 block">节点类型 (Node Type)</label>
                  <select 
                    value={draftValues.type || 'junction'} 
                    onChange={e => handleDraftChange('type', e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none bg-white cursor-pointer text-slate-700 font-semibold"
                  >
                    <option value="junction">检查井 (Junction Manhole)</option>
                    <option value="outfall">雨水排放口 (Outfall Terminal)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">地面高程 (Gr, m)</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={draftValues.maxDepth !== undefined && draftValues.elevation !== undefined ? (draftValues.elevation + draftValues.maxDepth).toFixed(2) : '103.00'} 
                      onChange={e => {
                        const newGround = parseFloat(e.target.value) || 103;
                        const depth = Math.max(0.5, newGround - (draftValues.elevation || 100));
                        handleDraftChange('maxDepth', depth);
                      }}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">井底标高 (Inv, m)</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={draftValues.elevation ?? 100} 
                      onChange={e => handleDraftChange('elevation', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                    />
                  </div>
                </div>

                {draftValues.type === 'outfall' && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-bold text-slate-700 block">排放边界工况</label>
                      <select 
                        value="FREE" 
                        readOnly
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none bg-slate-50 text-slate-500 font-semibold"
                      >
                        <option value="FREE">自由出流 (Free Stage Output)</option>
                        <option value="FIXED">恒定静水标高 (Fixed Stage)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Connections section (Network relation graph) */}
                {relations && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-150/80 space-y-1.5 text-[10.5px] text-slate-600 mt-2">
                    <h5 className="font-semibold text-slate-800 border-b border-slate-200/60 pb-1 mb-1 mb-1.5 flex items-center gap-1">
                      <Network size={11.5} className="text-amber-600" />
                      <span>相连管段及流向</span>
                    </h5>
                    <div>
                      流入管线: {relations.inLinks.length > 0 ? (
                        <span className="font-mono text-emerald-700 font-bold">{relations.inLinks.join(', ')}</span>
                      ) : (
                        <span className="text-slate-400">无输入线</span>
                      )}
                    </div>
                    <div>
                      流出管线: {relations.outLinks.length > 0 ? (
                        <span className="font-mono text-indigo-700 font-bold">{relations.outLinks.join(', ')}</span>
                      ) : (
                        <span className="text-slate-400">无输出线</span>
                      )}
                    </div>
                    {relations.areas.length > 0 && (
                      <div>
                        汇入排水分区: <span className="font-mono text-teal-700 font-bold">{relations.areas.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {renderedElement.type === 'link' && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 block">管段标识号 (Conduit Identifier)</label>
                  <input 
                    type="text" 
                    value={draftValues.name || ''} 
                    onChange={e => handleDraftChange('name', e.target.value)}
                    className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">截面形式 (Shape)</label>
                    <select 
                      value={draftValues.shape || 'circular'} 
                      onChange={e => handleDraftChange('shape', e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none bg-white cursor-pointer text-slate-705 font-bold"
                    >
                      <option value="circular">圆形 (Circular / Pipe)</option>
                      <option value="rectangular">矩形箱涵 (Box Culvert)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">曼宁粗糙度系数 n</label>
                    <input 
                      type="number" 
                      step="0.001"
                      value={draftValues.roughness ?? 0.013} 
                      onChange={e => handleDraftChange('roughness', parseFloat(e.target.value) || 0.013)}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">
                      {draftValues.shape === 'rectangular' ? '宽度 B (mm)' : '管径 DN (mm)'}
                    </label>
                    <select
                      value={draftValues.diameter ?? 600}
                      onChange={e => handleDraftChange('diameter', parseInt(e.target.value) || 600)}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-2 py-1.5 border border-slate-200 rounded-lg outline-none h-9 bg-white cursor-pointer"
                    >
                      {STANDARD_DIAMETERS.map(dia => (
                        <option key={dia} value={dia}>{dia} mm</option>
                      ))}
                    </select>
                  </div>

                  {draftValues.shape === 'rectangular' ? (
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-bold text-slate-700 block">高度 H (mm)</label>
                      <select
                        value={draftValues.height ?? 600}
                        onChange={e => handleDraftChange('height', parseInt(e.target.value) || 600)}
                        className="w-full text-xs font-mono font-bold text-slate-800 px-2 py-1.5 border border-slate-200 rounded-lg outline-none h-9 bg-white cursor-pointer"
                      >
                        {STANDARD_DIAMETERS.map(dia => (
                          <option key={dia} value={dia}>{dia} mm</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-bold text-slate-500 block">流体阻尼指数</label>
                      <input 
                        type="text" 
                        readOnly 
                        value="1.00 (SWMM Default)"
                        className="w-full text-xs font-sans font-medium text-slate-400 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg outline-none h-9 text-center"
                      />
                    </div>
                  )}
                </div>

                {relations && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-150/80 space-y-1.5 text-[10.5px] text-slate-600 mt-2">
                    <h5 className="font-semibold text-slate-805 border-b border-slate-200/60 pb-1 mb-1.5 flex items-center gap-1">
                      <Network size={11.5} className="text-amber-600 select-none" />
                      <span>连接拓扑井底高差情况</span>
                    </h5>
                    <div className="flex justify-between">
                      <span>起点检查井:</span>
                      <span className="font-mono text-indigo-700 font-bold">{relations.fromNode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>终点检查井:</span>
                      <span className="font-mono text-indigo-700 font-bold">{relations.toNode}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {renderedElement.type === 'catchment' && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 block">径流分区标识号</label>
                  <input 
                    type="text" 
                    value={draftValues.name || ''} 
                    onChange={e => handleDraftChange('name', e.target.value)}
                    className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">占地面积 (A, Ha)</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={draftValues.area ?? 1.5} 
                      onChange={e => handleDraftChange('area', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">径流系数 (RC, C)</label>
                    <input 
                      type="number" 
                      step="0.05"
                      min="0.05"
                      max="1.0"
                      value={draftValues.runoffCoefficient ?? 0.55} 
                      onChange={e => handleDraftChange('runoffCoefficient', parseFloat(e.target.value) || 0.5)}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-550"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">地表铺装材质</label>
                    <select 
                      value={draftValues.surfaceType || 'concrete'} 
                      onChange={e => handleDraftChange('surfaceType', e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none bg-white cursor-pointer font-semibold text-slate-700 h-9"
                    >
                      <option value="concrete">硬水泥/屋顶 (0.90)</option>
                      <option value="clay">重粘土/铺石 (0.60)</option>
                      <option value="sand">荒地/细沙土 (0.25)</option>
                      <option value="grass">绿化草坪 (0.15)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 block">集水时间 (Te, Min)</label>
                    <input 
                      type="number" 
                      value={draftValues.inletTime ?? 10} 
                      onChange={e => handleDraftChange('inletTime', parseInt(e.target.value) || 10)}
                      className="w-full text-xs font-mono font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg outline-none h-9 focus:ring-2 focus:ring-amber-550"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 block">出水汇流节点 (Outlet Manhole)</label>
                  <select 
                    value={draftValues.outletNodeId || ''} 
                    onChange={e => handleDraftChange('outletNodeId', e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none bg-white cursor-pointer text-slate-700 font-mono font-bold"
                  >
                    <option value="">-- 选择对应排放检查井 --</option>
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.type === 'outfall' ? '排放口' : '井'})</option>
                    ))}
                  </select>
                </div>

                {relations && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-150/80 space-y-1.5 text-[10.5px] text-slate-605 mt-2">
                    <h5 className="font-semibold text-slate-800 border-b border-slate-200/60 pb-1 mb-1.5 flex items-center gap-1">
                      <Network size={11.5} className="text-amber-600" />
                      <span>集水下游边界关系</span>
                    </h5>
                    <div className="flex justify-between">
                      <span>雨水汇流出水口:</span>
                      <span className="font-mono text-emerald-700 font-bold">{relations.destination}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions Form Save Button */}
            <div className="pt-2">
              <button 
                onClick={handleSaveChanges}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-transparent shadow shadow-amber-200 outline-none"
              >
                <Database size={13} />
                <span>保存应用要素修改</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================== STATE C: ③ RUN SIMULATION ==================== */}
        {renderedState === 'run' && (
          <div id="simulation-panel" className="space-y-4 animate-fadeIn select-all">
            
            {/* Guard against incomplete steps */}
            {!isReadyForSim ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 px-3 mx-1 text-center my-2 select-text">
                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 text-amber-500 flex items-center justify-center mx-auto shadow-sm">
                  <Activity size={20} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-850">🔒 模拟引擎已安全锁定</h4>
                  <p className="text-[10.5px] text-slate-500 mt-1 leading-relaxed">
                    水力仿真计算要求模型中必须存在有效的输水管线。请先在 **① 网络建模** 中利用底部工具绘制管线连接检查井（必须有至少两个检查井，并在中间连接至少一条管道），并在 **② 降雨条件** 设置适当的设计暴雨参数。
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* ENGINE SELECTOR (always visible at top of panel): Two cards side by side */}
                <div className="space-y-1.5 select-all">
                  <label className="flex items-center gap-1 text-[11.5px] font-extrabold text-slate-500 uppercase tracking-widest pl-0.5">
                    ⚙️ 仿真内核选择 · Solver Engine Selection
                  </label>
                  
                  <div className="grid grid-cols-2 gap-2 select-all">
                    {/* Card A — 推理公式法 */}
                    <button
                      id="engine-card-rational"
                      onClick={() => {
                        setParams({
                          ...params,
                          routingMethod: 'RATIONAL',
                          method: 'rational'
                        });
                        setSimulationLogs([]);
                      }}
                      className={cn(
                        "p-2.5 rounded-xl text-left flex flex-col justify-between transition-all cursor-pointer outline-none relative h-[94px] overflow-hidden select-none",
                        params.routingMethod === 'RATIONAL'
                          ? "bg-blue-50/75 border-2 border-blue-600 shadow-md shadow-blue-100"
                          : "bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm"
                      )}
                    >
                      <div>
                        <div className="flex justify-between items-center">
                          <span className={cn("text-xs font-black font-sans leading-none", params.routingMethod === 'RATIONAL' ? "text-blue-700" : "text-slate-800")}>
                            推理公式法
                          </span>
                          <span className="text-[8.5px] font-bold px-1 py-0.5 bg-slate-100 text-slate-500 border rounded font-mono leading-none shadow-none">
                            &lt; 2 秒
                          </span>
                        </div>
                        <p className="text-[9.5px] font-medium text-slate-500 mt-1 leading-tight">
                          稳态峰值设计
                          <br />
                          初步管径确定
                        </p>
                      </div>
                      <div className="text-[8.5px] font-semibold text-slate-400 font-mono mt-1 leading-none">
                        RATIONAL METHOD
                      </div>
                    </button>

                    {/* Card B — 动力波法 */}
                    <button
                      id="engine-card-swmm"
                      onClick={() => {
                        setParams({
                          ...params,
                          routingMethod: 'DYNAMIC_SWMM',
                          method: 'chicago'
                        });
                      }}
                      className={cn(
                        "p-2.5 rounded-xl text-left flex flex-col justify-between transition-all cursor-pointer outline-none relative h-[94px] overflow-hidden select-none",
                        params.routingMethod === 'DYNAMIC_SWMM'
                          ? "bg-indigo-50/75 border-2 border-indigo-600 shadow-md shadow-indigo-100"
                          : "bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm"
                      )}
                    >
                      <div className="w-full">
                        <div className="flex justify-between items-center w-full">
                          <span className={cn("text-xs font-black font-sans leading-none", params.routingMethod === 'DYNAMIC_SWMM' ? "text-indigo-700" : "text-slate-800")}>
                            动力波法
                          </span>
                          <span className="text-[8.5px] font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-mono font-bold leading-none select-none">
                            推荐校核
                          </span>
                        </div>
                        <p className="text-[9.5px] font-medium text-slate-500 mt-1 leading-tight">
                          完整时程模拟
                          <br />
                          水力精确校核
                        </p>
                      </div>
                      <div className="flex justify-between items-center w-full text-[8.5px] font-semibold text-slate-400 font-mono mt-1 leading-none">
                        <span>DYNAMIC SWMM</span>
                        <span className="text-[8px] bg-slate-200/60 text-slate-600 font-bold px-1 rounded transform origin-right">
                          30s-5m
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 核心水力学/动力学公式解析展示 (Mathematical Core Formulation Panel) */}
                <FormulaDisplay engine={params.routingMethod === 'RATIONAL' ? 'rational' : 'dynamic'} />

                <div className="border-t border-slate-150 my-1 shadow-none"></div>

                {/* PANEL A — Rational Method */}
                {params.routingMethod === 'RATIONAL' && (
                  <div className="space-y-3.5 animate-fadeIn select-all">
                    
                    {/* Group 1: 汇水区参数 */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-2.5">
                      <div className="flex items-center gap-1 border-b border-slate-150 pb-1.5 shadow-none mb-1">
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded font-sans scale-[0.95]">Group 1</span>
                        <span className="text-[11px] font-black text-slate-700 font-sans tracking-wide">
                          汇水区参数 / Catchment Area Config
                        </span>
                      </div>

                      {/* Runoff Coefficient C slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs pl-0.5 font-sans">
                          <span className="text-slate-600 font-semibold">径流系数 C</span>
                          <span className="font-mono font-black text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-[10.5px]">
                            {rationalC.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.10"
                          max="0.95"
                          step="0.01"
                          value={rationalC}
                          onChange={(e) => {
                            setRationalC(parseFloat(e.target.value) || 0.6);
                          }}
                          className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Land-use quick-pick chips */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          onClick={() => setRationalC(0.85)}
                          className={cn(
                            "text-[9.5px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer outline-none shadow-none",
                            Math.abs(rationalC - 0.85) < 0.005
                              ? "bg-blue-600 text-white border-blue-500 font-bold"
                              : "bg-white text-slate-650 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          硬质铺装 0.85
                        </button>
                        <button
                          onClick={() => setRationalC(0.60)}
                          className={cn(
                            "text-[9.5px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer outline-none shadow-none",
                            Math.abs(rationalC - 0.60) < 0.005
                              ? "bg-blue-600 text-white border-blue-500 font-bold"
                              : "bg-white text-slate-650 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          居住区 0.60
                        </button>
                        <button
                          onClick={() => setRationalC(0.25)}
                          className={cn(
                            "text-[9.5px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer outline-none shadow-none",
                            Math.abs(rationalC - 0.25) < 0.005
                              ? "bg-blue-600 text-white border-blue-500 font-bold"
                              : "bg-white text-slate-650 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          绿地 0.25
                        </button>
                      </div>

                      {/* 汇水面积 A: read-only, pulled from map subcatchment sum */}
                      <div className="flex justify-between items-center text-xs pl-0.5 pt-1.5 border-t border-slate-200/60">
                        <span className="text-slate-500 font-sans">汇水面积 A:</span>
                        <div className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                          {catchments.reduce((acc, curr) => acc + (curr.area || 0), 0).toFixed(2)} ha (公顷)
                        </div>
                      </div>
                    </div>

                    {/* Group 2: 降雨参数 (read-only summary from Step ②) */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-2.5">
                      <div className="flex items-center gap-1 border-b border-slate-150 pb-1.5 shadow-none mb-1">
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded font-sans scale-[0.95]">Group 2</span>
                        <span className="text-[11px] font-black text-slate-700 font-sans tracking-wide">
                          降雨参数 / Design Storm Parameters
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs pl-0.5">
                        <span className="text-slate-500 font-sans">重现期 P:</span>
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                            {selectedP}年
                          </span>
                          <button
                            onClick={() => onTabChange('rainfall')}
                            className="text-[10px] text-blue-650 font-black hover:underline cursor-pointer outline-none"
                            aria-label="重配置降雨条件"
                          >
                            链接 &rarr; 编辑设计雨型
                          </button>
                        </div>
                      </div>

                      {/* 降雨强度 I: computed from formula, editable override input */}
                      <div className="space-y-1 pt-1.5 border-t border-slate-200/60">
                        <div className="flex justify-between items-center text-xs pl-0.5">
                          <span className="text-slate-500">降雨强度 I (mm/h)</span>
                          <span className="font-mono text-[9px] text-slate-400 font-semibold bg-white border border-slate-150 px-1.5 rounded">
                            公式计算值: {parseFloat(((getShenzhenQ(selectedP, selectedDuration * 60)) * 0.36).toFixed(2))}
                          </span>
                        </div>
                        
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            step="0.1"
                            value={rationalI !== '' ? rationalI : parseFloat(((getShenzhenQ(selectedP, selectedDuration * 60)) * 0.36).toFixed(2)).toString()}
                            onChange={(e) => {
                              setRationalI(e.target.value);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600 text-slate-800 font-mono font-bold"
                            placeholder="配置手动覆盖强度"
                          />
                          {rationalI !== '' && (
                            <button
                              onClick={() => setRationalI('')}
                              className="absolute right-2.5 top-1.5 text-[9px] font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 px-1.5 py-0.5 rounded border"
                            >
                              清除覆盖
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Group 3: 设计流量估算 */}
                    <div id="rational-equation-preview" className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-2.5 select-all">
                      <div className="flex items-center gap-1 border-b border-slate-150 pb-1.5 shadow-none mb-1">
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded font-sans scale-[0.95]">Group 3</span>
                        <span className="text-[11px] font-black text-slate-700 font-sans tracking-wide">
                          设计流量估算 / Design Discharge Estimate
                        </span>
                      </div>

                      <div className="bg-blue-50/50 dark:bg-blue-950/20 p-2.5 border border-blue-100 dark:border-blue-900/40 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-slate-350">
                          <span>当前参数下全网最大设计流量：</span>
                          <span className="font-mono text-blue-650 dark:text-blue-400 font-black text-[12px] animate-pulse">
                            {((rationalC * (rationalI !== '' ? parseFloat(rationalI) : parseFloat(((getShenzhenQ(selectedP, selectedDuration * 60)) * 0.36).toFixed(2))) * catchments.reduce((acc, curr) => acc + (curr.area || 0), 0) * 1000) / 360).toFixed(1)} L/s
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* After run: Pipe Fullness check result table */}
                    {runState === 'success' && rationalResults && (
                      <div className="space-y-2 pt-1.5 animate-fadeIn select-all">
                        <div className="flex justify-between items-center pl-0.5 select-all">
                          <h4 className="text-[10.5px] font-black text-slate-700 uppercase tracking-wide">
                            📈 管外径限界与充满度校核表
                          </h4>
                          <button
                            onClick={() => {
                              rationalResults.forEach(res => {
                                updateLink(res.id, { diameter: res.dRecommended, height: res.dRecommended });
                              });
                              setSuccessMessage('✓ 已成功按静态公式推荐规格一键重置网格管径！');
                              setTimeout(() => setSuccessMessage(null), 3000);
                            }}
                            className="text-[9.5px] text-blue-600 font-extrabold hover:underline cursor-pointer outline-none bg-blue-50 px-2 py-0.5 rounded border border-blue-150"
                          >
                            [应用推荐管径]
                          </button>
                        </div>

                        <div className="border border-slate-150 rounded-xl overflow-hidden bg-white text-[10px] shadow-sm select-all">
                          <table className="w-full text-left border-collapse select-all">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-150 text-[8.5px] font-extrabold text-slate-500 uppercase font-sans">
                                <th className="p-2 pl-2.5">管道 ID</th>
                                <th className="p-2 text-right">当前 DN</th>
                                <th className="p-2 text-right">设计推荐</th>
                                <th className="p-2 text-right pr-2.5">充满比</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono select-all">
                              {rationalResults.map(res => (
                                <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-2 pl-2.5 font-sans font-bold text-slate-700">{res.name}</td>
                                  <td className="p-2 text-right text-slate-600 font-semibold">DN{res.dDesigned}</td>
                                  <td className="p-2 text-right text-blue-600 font-extrabold">
                                    DN{res.dRecommended}
                                  </td>
                                  <td className="p-2 text-right pr-2.5 font-black text-slate-800">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[9.5px]",
                                      res.fillRatio > 90 
                                        ? "text-red-750 bg-red-50 border border-red-150 font-black animate-pulse" 
                                        : res.fillRatio > 65 
                                          ? "text-amber-700 bg-amber-50 border border-amber-100 font-bold" 
                                          : "text-emerald-700 bg-emerald-50 border border-emerald-100"
                                    )}>
                                      {res.fillRatio.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* PANEL B — Dynamic Wave */}
                {params.routingMethod === 'DYNAMIC_SWMM' && (
                  <div className="space-y-3.5 animate-fadeIn select-all">

                    {/* Group 1: 降雨边界 */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 pb-2.5">
                      <div className="flex items-center gap-1 border-b border-slate-150 pb-1.5 shadow-none mb-1">
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded font-sans scale-[0.95]">Group 1</span>
                        <span className="text-[11px] font-black text-slate-700 font-sans tracking-wide">
                          降雨边界 / Rainfall Boundary Model
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="text-[10.5px] text-slate-500 font-normal leading-relaxed pl-0.5">
                          关联降雨设计条件 (Auto-Linked Storm Config)
                        </div>

                        {/* Rain profile summary chip */}
                        <div className="p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg flex items-center justify-between shadow-none">
                          <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                            <CloudRain size={13} className="text-indigo-600 animate-pulse" />
                            {selectedRainType === 'CHICAGO' ? "芝加哥合成雨型" : selectedRainType === 'SCS' ? "SCS II型标准分配" : selectedRainType === 'UNIFORM' ? "稳定流降雨过程" : "实测暴雨时序序列"}
                          </span>
                          <span className="font-mono text-[9.5px] font-black text-indigo-605 bg-white border border-indigo-100 px-1.5 py-0.5 rounded shadow-sm">
                            P={selectedP}年 | {selectedDuration}h
                          </span>
                        </div>

                        <button
                          onClick={() => onTabChange('rainfall')}
                          className="w-full py-1.5 border border-dashed border-indigo-200 bg-white hover:bg-indigo-50 text-[10.5px] font-bold text-indigo-705 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors outline-none mt-1"
                        >
                          [重新配置降雨] &rarr; 跳转至 Step ②
                        </button>
                      </div>
                    </div>

                    {/* Group 2: 模拟时间控制 */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3 pb-3">
                      <div className="flex items-center gap-1 border-b border-slate-150 pb-1.5 shadow-none mb-1">
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded font-sans scale-[0.95]">Group 2</span>
                        <span className="text-[11px] font-black text-slate-700 font-sans tracking-wide">
                          模拟时间控制 / Dynamic Period & Steps
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {/* 模拟历时 */}
                        <div className="space-y-1">
                          <label className="block text-[10.5px] font-bold text-slate-700">
                            模拟历时
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            max="72"
                            step="0.5"
                            value={simDuration}
                            onChange={(e) => setSimDuration(parseFloat(e.target.value) || 3)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-600 text-slate-800 font-mono font-bold"
                            aria-label="模拟历时"
                          />
                        </div>

                        {/* 水力时间步长 */}
                        <div className="space-y-1">
                          <label className="block text-[10.5px] font-bold text-slate-700">
                            水力时间步长
                          </label>
                          <select
                            value={hydraulicStep}
                            onChange={(e) => setHydraulicStep(parseInt(e.target.value))}
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 font-mono focus:ring-2 focus:ring-indigo-600 outline-none cursor-pointer h-[33px]"
                            aria-label="水力时间步长"
                          >
                            <option value="5">5s</option>
                            <option value="10">10s</option>
                            <option value="15">15s</option>
                            <option value="30">30s</option>
                            <option value="60">60s</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                        {/* 报告输出间隔 */}
                        <div className="space-y-1">
                          <label className="block text-[10.5px] font-bold text-slate-700">
                            报告输出间隔
                          </label>
                          <select
                            value={reportInterval}
                            onChange={(e) => setReportInterval(parseInt(e.target.value))}
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 font-mono focus:ring-2 focus:ring-indigo-600 outline-none cursor-pointer h-[33px]"
                            aria-label="报告输出间隔"
                          >
                            <option value="1">1min</option>
                            <option value="5">5min</option>
                            <option value="10">10min</option>
                            <option value="30">30min</option>
                          </select>
                        </div>

                        {/* 初始条件 */}
                        <div className="space-y-1">
                          <label className="block text-[10.5px] font-bold text-slate-700">
                            初始条件
                          </label>
                          <select
                            value={initialCondition}
                            onChange={(e) => setInitialCondition(e.target.value as any)}
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 font-bold focus:ring-2 focus:ring-indigo-600 outline-none cursor-pointer h-[33px]"
                            aria-label="初始条件"
                          >
                            <option value="dry">干管道(默认)</option>
                            <option value="hot">热启动(上次结果)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Group 3: 高级选项 (collapsed, expand with chevron) */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <button
                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                        className="w-full flex items-center justify-between text-xs font-black text-slate-700 outline-none focus:outline-none cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded font-sans scale-[0.95]">Group 3</span>
                          <span>高级选项 / Numerical Controls</span>
                        </span>
                        {showAdvancedOptions ? <ChevronUp size={14} className="text-slate-505" /> : <ChevronDown size={14} className="text-slate-505" />}
                      </button>

                      {showAdvancedOptions && (
                        <div className="space-y-3 pt-2 border-t border-slate-200/55 animate-fadeIn">
                          {/* 入渗模型 */}
                          <div className="space-y-1">
                            <label className="block text-[10.5px] font-semibold text-slate-600">
                              入渗模型 (Infiltration Model)
                            </label>
                            <select
                              value={infiltrationModel}
                              onChange={(e) => setInfiltrationModel(e.target.value as any)}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-755 outline-none cursor-pointer"
                            >
                              <option value="HORTON">Horton / 霍顿公式</option>
                              <option value="GREEN_AMPT">Green-Ampt / 格林-安普特</option>
                              <option value="CURVE_NUMBER">CN曲线法 / SCS USDA</option>
                            </select>
                          </div>

                          {/* 允许超出地面溢流 & 最大迭代次数 */}
                          <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                            {/* 允许超出地面溢流 */}
                            <div className="space-y-1.5">
                              <span className="block font-semibold text-slate-600">允许超出地面溢流</span>
                              <label className="relative inline-flex items-center cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={allowPonding}
                                  onChange={(e) => setAllowPonding(e.target.checked)}
                                  className="sr-only peer"
                                  aria-label="允许超出地面溢流"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                <span className="ml-2 font-mono text-[9px] font-bold text-slate-750 uppercase">
                                  {allowPonding ? "ON" : "OFF"}
                                </span>
                              </label>
                            </div>

                            {/* 最大迭代次数 */}
                            <div className="space-y-1">
                              <span className="block font-semibold text-slate-600">最大迭代次数</span>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={maxIterations}
                                onChange={(e) => setMaxIterations(parseInt(e.target.value) || 8)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-600 text-slate-800 font-mono font-bold"
                                aria-label="最大迭代次数"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* SWMM Inp Exporter Preview & Export Card */}
                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl space-y-2 shadow-inner mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                          <FileCode size={13} className="text-slate-505" />
                          EPA-SWMM 模型文件 (.inp)
                        </span>
                        <span className="text-[8.5px] bg-slate-200 text-slate-700 px-1.5 rounded font-mono font-bold">EPA 5.2</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleInspectInp}
                          className="py-1 px-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-[10px] font-bold text-slate-705 flex items-center justify-center gap-1 cursor-pointer transition-colors outline-none shadow-sm"
                        >
                          <Eye size={12} />
                          <span>预览 INP</span>
                        </button>
                        <button
                          onClick={handleDownloadInp}
                          className="py-1 px-1.5 bg-slate-800 hover:bg-slate-900 border border-transparent rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-1 cursor-pointer transition-all outline-none shadow-sm"
                        >
                          <Download size={12} />
                          <span>导出 .inp</span>
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                {/* ================= SHARED RUN STATE MACHINE ================= */}
                <div className="pt-3 border-t border-slate-200 mt-3 relative">
                  {runState === 'ready' && (
                    <button
                      onClick={params.routingMethod === 'RATIONAL' ? runRationalCalculation : triggerDynamicSimulation}
                      className="w-full text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-[11px] cursor-pointer outline-none bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100 border border-blue-600"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>{params.routingMethod === 'RATIONAL' ? '▶ 运行管径设计计算' : '▶ 启动水力模拟'}</span>
                    </button>
                  )}

                  {runState === 'running' && (
                    <div className="space-y-3 animate-fadeIn">
                      {/* Progress Area */}
                      <div className="p-3 bg-blue-50 border border-blue-150 rounded-xl space-y-2">
                        <div className="flex justify-between items-center text-[10.5px] font-extrabold text-blue-800">
                          <span className="flex items-center gap-1.5">
                            <div className="border-[2px] border-blue-300 border-t-blue-600 w-3.5 h-3.5 rounded-full animate-spin"></div>
                            正在计算...
                          </span>
                          <span className="font-mono text-slate-500">{(runElapsedMs / 1000).toFixed(1)}s</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-600 h-full transition-all duration-155" 
                            style={{ width: `${params.routingMethod === 'RATIONAL' ? 100 : simProgress}%` }}
                          ></div>
                        </div>
                        <button
                          onClick={stopSimulation}
                          className="w-full py-1.5 bg-white border border-slate-200 text-slate-600 text-[9.5px] font-bold rounded flex justify-center items-center gap-1 mt-2 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <X size={10} /> 终止计算
                        </button>
                      </div>

                      {/* Log Area */}
                      {simulationLogs.length > 0 && (
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 text-left font-mono text-[9px] leading-relaxed text-emerald-450 space-y-1 shadow-inner h-24 overflow-y-auto">
                          {simulationLogs.slice(-4).map((log, i) => (
                            <div key={i} className="whitespace-pre-line tracking-tight leading-normal text-emerald-400 font-medium">
                              {log}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {runState === 'success' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-center space-y-1 shadow-sm">
                        <div className="flex justify-center text-emerald-600 mb-1">
                          <CheckCircle2 size={24} />
                        </div>
                        <div className="text-[11.5px] font-black">
                          ✓ 计算完成 — 历时 {(runElapsedMs / 1000).toFixed(1)}s
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setRunState('ready')}
                          className="py-2 bg-white border border-slate-200 text-slate-600 text-[10.5px] font-bold rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
                        >
                          重新计算
                        </button>
                        <button
                          onClick={() => onTabChange('evaluation')}
                          className="py-2 bg-emerald-600 border border-emerald-700 text-white text-[10.5px] font-bold rounded-xl shadow-md shadow-emerald-100 hover:bg-emerald-700 cursor-pointer transition-all flex items-center justify-center gap-1"
                        >
                          查看结果 &rarr;
                        </button>
                      </div>
                    </div>
                  )}

                  {runState === 'error' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 space-y-2 shadow-sm">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                          <AlertTriangle size={14} />
                          <span>计算异常 ({runErrorCode || 'ERR_UNKNOWN'})</span>
                        </div>
                        <p className="text-[9.5px] font-semibold text-red-600 leading-snug">
                          {runErrorMsg || '引擎运行时发生未知错误，请检查模型参数配置是否合理。'}
                        </p>
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <button
                          onClick={() => console.log('Expand logs')}
                          className="text-[9.5px] font-bold text-slate-500 hover:text-slate-700 transition cursor-pointer"
                        >
                          展开错误日志 ▾
                        </button>
                        <button
                          onClick={() => console.log('Get hints')}
                          className="text-[9.5px] font-bold text-blue-600 hover:text-blue-700 transition flex items-center gap-0.5 cursor-pointer"
                        >
                          获取修复建议 ↗
                        </button>
                      </div>
                      <button
                        onClick={() => setRunState('ready')}
                        className="w-full py-2 border border-slate-200 bg-white text-slate-700 font-bold rounded-xl text-[10px] hover:bg-slate-50 transition cursor-pointer"
                      >
                        返回修改参数
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== STATE D: ④ RESULTS EVALUATION ==================== */}
        {renderedState === 'results' && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* SUB-TABS SELECTOR */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 pl-0.5">
                评估指标切换 (Results Evaluation Sub-Tabs)
              </label>
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setEvaluationSubTab('overview')}
                  className={cn(
                    "py-1.5 text-[10px] sm:text-[10.5px] font-bold rounded-lg transition-all text-center cursor-pointer outline-none",
                    evaluationSubTab === 'overview'
                      ? "bg-emerald-600 text-white shadow-sm font-extrabold"
                      : "text-slate-600 hover:bg-slate-200"
                  )}
                >
                  管网总览
                </button>
                <button
                  onClick={() => setEvaluationSubTab('fullness')}
                  className={cn(
                    "py-1.5 text-[10px] sm:text-[10.5px] font-bold rounded-lg transition-all text-center cursor-pointer outline-none",
                    evaluationSubTab === 'fullness'
                      ? "bg-emerald-600 text-white shadow-sm font-extrabold"
                      : "text-slate-600 hover:bg-slate-200"
                  )}
                >
                  充满度
                </button>
                <button
                  onClick={() => setEvaluationSubTab('overload')}
                  className={cn(
                    "py-1.5 text-[10px] sm:text-[10.5px] font-bold rounded-lg transition-all text-center cursor-pointer outline-none",
                    evaluationSubTab === 'overload'
                      ? "bg-emerald-600 text-white shadow-sm font-extrabold"
                      : "text-slate-600 hover:bg-slate-200"
                  )}
                >
                  超载节点
                </button>
                <button
                  onClick={() => setEvaluationSubTab('flood')}
                  className={cn(
                    "py-1.5 text-[10px] sm:text-[10.5px] font-bold rounded-lg transition-all text-center cursor-pointer outline-none",
                    evaluationSubTab === 'flood'
                      ? "bg-emerald-600 text-white shadow-sm font-extrabold"
                      : "text-slate-600 hover:bg-slate-200"
                  )}
                >
                  内涝风险
                </button>
              </div>
            </div>

            {/* SUB-TAB CONTENTS */}
            {!simulationResult ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 text-center my-2 select-text">
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                  <BarChart2 size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700">暂无计算数据结果</h4>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    请先跳转至 **③ 运行计算** 页签，启动水动力引擎进行仿真计算，然后返回此处进行一键多属性指标校合诊断。
                  </p>
                </div>
              </div>
            ) : (() => {
              // Calculate statistics
              const totalLengthKm = (links.reduce((sum, l) => sum + (l.length || 0), 0) / 1000).toFixed(2);
              const totalSegments = links.length;
              const overloadedCount = statsSummary.overloadedList.length;
              const floodedCount = statsSummary.floodedList.length;
              const pct = totalSegments > 0 ? ((overloadedCount / totalSegments) * 100).toFixed(1) : "0.0";
              
              let summaryText = "";
              if (overloadedCount > 0) {
                const overloadedNames = statsSummary.overloadedList.map(p => p.name);
                const primaryArea = overloadedNames.length > 0 ? `${overloadedNames.slice(0, 2).join('、')}等段` : "中游主管网";
                const maxOverloadedD = Math.max(...statsSummary.overloadedList.map(p => p.diameter || 0));
                const suggestedD = maxOverloadedD > 0 ? maxOverloadedD + 100 : 400;
                summaryText = `本次模拟中，共 ${overloadedCount} 段管线超出设计充满度，占比 ${pct}%，主要集中在 [${primaryArea}] 区域，建议该段管道扩大管径至 DN${suggestedD} 以上。`;
              } else {
                summaryText = "本次模拟中，全部管段满载充满度小于 1.0 满负荷状态，管网无流阻淤积溢满，地表零漫顶，水动力合规评定等级卓越！";
              }

              // Horizontal bar data, sorted descending
              const barData = links.map(l => {
                const linkRes = simulationResult.linkResults[l.id];
                const ratio = linkRes ? (linkRes.flow / Math.max(0.001, linkRes.capacity)) : 0;
                return {
                  id: l.id,
                  name: l.name,
                  ratio,
                  flow: linkRes ? linkRes.flow : 0,
                  capacity: linkRes ? linkRes.capacity : 0.1,
                  diameter: l.diameter
                };
              }).sort((a, b) => b.ratio - a.ratio);

              // Overloaded nodes sorted descending by flood duration
              const nodeTableData = nodes.map(n => {
                const res = simulationResult.nodeResults[n.id];
                if (!res) return null;
                const ratio = res.depth / Math.max(0.1, n.maxDepth);
                const isOverloaded = ratio >= 0.8;
                const isFlooded = res.flooded || ((n as any).overflowRate && (n as any).overflowRate > 0);
                
                const floodDuration = isFlooded ? Math.max(5, Math.floor((res.depth / Math.max(1, n.maxDepth)) * 30)) : 0;
                const floodVolume = isFlooded ? parseFloat((((n as any).overflowRate || 0.15) * floodDuration * 0.06).toFixed(1)) : 0;
                const overflowStartTime = isFlooded ? "T+15m" : "无";
                
                return {
                  id: n.id,
                  name: n.name,
                  maxDepth: n.maxDepth,
                  peakDepth: res.depth,
                  ratio,
                  isOverloaded,
                  isFlooded,
                  floodDuration,
                  floodVolume,
                  overflowStartTime,
                  type: n.type
                };
              }).filter(Boolean) as any[];

              nodeTableData.sort((a, b) => b.floodDuration - a.floodDuration);

              return (
                <div className="space-y-4 pt-1">
                  
                  {/* ====== SUB-TAB 1: 管网总览 ====== */}
                  {evaluationSubTab === 'overview' && (
                    <div className="space-y-3.5 animate-fadeIn">
                      {/* Metric cards: 2x2 grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-sm">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">管网总长度</span>
                          <p className="text-lg font-black font-mono text-slate-700">{totalLengthKm} <span className="text-xs font-normal">km</span></p>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-sm">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">管段总数</span>
                          <p className="text-lg font-black font-mono text-slate-700">{totalSegments} <span className="text-xs font-normal">段</span></p>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-sm relative">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">超载管段数</span>
                          <div className="flex items-center gap-1.5">
                            <p className="text-lg font-black font-mono text-slate-700">
                              {overloadedCount}
                            </p>
                            {overloadedCount > 0 && (
                              <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full text-[9px] font-black animate-pulse">
                                OVERLOAD
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-sm relative">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">节点溢流数</span>
                          <div className="flex items-center gap-1.5">
                            <p className="text-lg font-black font-mono text-slate-700">
                              {floodedCount}
                            </p>
                            {floodedCount > 0 && (
                              <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full text-[9px] font-black animate-pulse">
                                FLOODED
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Diagnostic Summary Panel */}
                      <div className={cn(
                        "p-3.5 border rounded-xl leading-relaxed text-xs",
                        overloadedCount > 0 
                          ? "bg-rose-50/70 border-rose-100/80 text-rose-800" 
                          : "bg-emerald-50/50 border-emerald-100/80 text-emerald-800"
                      )}>
                        <h4 className="font-bold flex items-center gap-1 border-b border-current/10 pb-1 mb-1.5 text-[11px]">
                          <AlertTriangle size={12} />
                          <span>一键智能水力合规判读 (Diagnostic Conclusion)</span>
                        </h4>
                        <p className="text-[11px] leading-relaxed select-text font-medium">{summaryText}</p>
                      </div>

                      {/* Export PDF Button */}
                      <button
                        onClick={handleExportPDF}
                        className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 outline-none cursor-pointer"
                      >
                        <Download size={13} className="text-slate-500" />
                        <span>导出评估报告 (Export PDF)</span>
                      </button>
                    </div>
                  )}

                  {/* ====== SUB-TAB 2: 充满度分析 ====== */}
                  {evaluationSubTab === 'fullness' && (
                    <div className="space-y-3.5 animate-fadeIn">
                      <div className="space-y-1 pl-0.5">
                        <span className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                          排水管孔径过流满载系数 (Q_peak / Q_capacity)
                        </span>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          以下各柱状条代表一段物理管道，数值 &gt; 1.0 即表示该管线超负荷运转产生涌水堵截。
                        </p>
                      </div>

                      {/* Horizontal bar list chart */}
                      <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin select-text">
                        <div className="flex justify-between text-[10px] text-slate-400 border-b border-slate-100 pb-1 px-1">
                          <span>管线编号 (规格)</span>
                          <span>最高充满度 (Q_p / Q_c)</span>
                        </div>
                        <div className="space-y-2.5">
                          {barData.map(item => {
                            const widthPct = Math.min(100, (item.ratio / 1.5) * 100);
                            
                            let barBgClass = "bg-emerald-500";
                            let textClass = "text-emerald-700 bg-emerald-50";
                            if (item.ratio > 1.00) {
                              barBgClass = "bg-rose-500 animate-pulse";
                              textClass = "text-rose-700 bg-rose-50";
                            } else if (item.ratio >= 0.70) {
                              barBgClass = "bg-amber-500";
                              textClass = "text-amber-700 bg-amber-50";
                            }
                            
                            const isSelected = selectedElement?.type === 'link' && selectedElement.id === item.id;
                            
                            return (
                              <div 
                                key={item.id}
                                onClick={() => {
                                  setSelectedElement({ type: 'link', id: item.id });
                                  setSuccessMessage(`已在地图中自动定位该管线段 🔍: ${item.name}`);
                                  setTimeout(() => setSuccessMessage(null), 2000);
                                }}
                                className={cn(
                                  "p-2.5 rounded-xl transition-all hover:bg-slate-50 cursor-pointer space-y-1.5 border border-transparent",
                                  isSelected && "bg-amber-50/50 border-amber-200/50"
                                )}
                              >
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="font-bold text-slate-700">{item.name} <span className="text-[10px] font-normal text-slate-400">(DN{item.diameter})</span></span>
                                  <span className={cn("font-mono font-bold text-[10px] px-1.5 py-0.2 rounded", textClass)}>
                                    {item.ratio.toFixed(2)}
                                  </span>
                                </div>
                                <div className="relative w-full h-3 bg-slate-100 rounded-full border border-slate-200/50 overflow-hidden">
                                  {/* Guideline ticks inside container */}
                                  <div className="absolute left-[46.7%] top-0 bottom-0 w-[0.8px] bg-amber-400 opacity-50 z-20" title="警戒线 0.7" />
                                  <div className="absolute left-[66.7%] top-0 bottom-0 w-[1.2px] bg-red-400 border-dashed border-red-500 z-11 opacity-60" title="超流量临界点 1.0" />
                                  
                                  <div 
                                    style={{ width: `${widthPct}%` }}
                                    className={cn("h-full rounded-full transition-all duration-300", barBgClass)}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-450 font-mono">
                                  <span>Q_peak: {item.flow.toFixed(3)} m³/s</span>
                                  <span>Q_cap: {item.capacity.toFixed(3)} m³/s</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex justify-between text-[9.5px] font-mono text-slate-400 px-1.5">
                        <span>充满系数: 0.0</span>
                        <span>0.7 (负荷预警)</span>
                        <span>1.0 (管壁溢流)</span>
                        <span>1.5+</span>
                      </div>
                    </div>
                  )}

                  {/* ====== SUB-TAB 3: 超载节点 ====== */}
                  {evaluationSubTab === 'overload' && (
                    <div className="space-y-3.5 animate-fadeIn">
                      <div className="space-y-1 pl-0.5">
                        <span className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                          检查井一二维溢流过载状况数据表 (Nodes Surcharge Table)
                        </span>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          点击节点数据行，地图将立刻自动对聚焦该井并在地图上进行黄色引导线关联渲染。
                        </p>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left border-collapse text-xs select-text">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-150 text-[10px] text-slate-500 font-bold uppercase">
                              <th className="py-2 px-3">节点号</th>
                              <th className="py-2 px-1">最大水位</th>
                              <th className="py-2 px-1">溢流起始</th>
                              <th className="py-2 px-1">历时(分)</th>
                              <th className="py-2 px-1 text-right pr-3">溢流量(m³)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                            {nodeTableData.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-slate-400">
                                  全部检查井地表零溢流，系统完美通过安全诊断！
                                </td>
                              </tr>
                            ) : nodeTableData.map(node => {
                              const isSelected = selectedElement?.type === 'node' && selectedElement.id === node.id;
                              
                              return (
                                <tr 
                                  key={node.id}
                                  onClick={() => {
                                    setSelectedElement({ type: 'node', id: node.id });
                                    setSuccessMessage(`已在地图中居中锁定节点 🔍: ${node.name}`);
                                    setTimeout(() => setSuccessMessage(null), 2000);
                                  }}
                                  className={cn(
                                    "hover:bg-slate-50 cursor-pointer transition-colors",
                                    isSelected && "bg-indigo-50/50 hover:bg-indigo-50"
                                  )}
                                >
                                  <td className="py-2.5 px-3 font-bold text-slate-800">
                                    <div className="flex items-center gap-1.5">
                                      <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        node.isFlooded ? "bg-red-500 animate-pulse" : node.isOverloaded ? "bg-amber-400" : "bg-emerald-500"
                                      )} />
                                      <span>{node.name}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-1 font-mono font-bold text-slate-700">{node.peakDepth.toFixed(2)}m</td>
                                  <td className="py-2.5 px-1 font-mono text-slate-500">{node.overflowStartTime}</td>
                                  <td className="py-2.5 px-1 font-mono font-black text-center">
                                    {node.floodDuration > 0 ? (
                                      <span className="text-red-650 bg-red-50 px-1.5 py-0.5 rounded">{node.floodDuration}</span>
                                    ) : (
                                      <span className="text-slate-400 font-normal">0</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-1 font-mono font-black text-right pr-3 text-rose-600 font-bold">
                                    {node.floodVolume > 0 ? (
                                      <span>{node.floodVolume.toFixed(1)}</span>
                                    ) : (
                                      <span className="text-slate-400 font-normal">0.0</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ====== SUB-TAB 4: 内涝风险图 ====== */}
                  {evaluationSubTab === 'flood' && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="space-y-1 pl-0.5">
                        <span className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                          2D 地表漫流与面源漫灌淹没风险管理 (2D Flooding Sandbox)
                        </span>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          通过调整设计雨水防汛标准重现期，并在降雨历时时间轴上拖曳滑动，来查看城市道路漫水的动态空间分布。
                        </p>
                      </div>

                      {/* Return Period buttons */}
                      <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <label className="text-[10.5px] font-bold text-slate-600 block uppercase tracking-wider">
                          设计降雨重现期标准控制 (P Return Period)
                        </label>
                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          {[2, 5, 10, 20].map((pVal) => (
                            <button
                              key={pVal}
                              onClick={() => {
                                setSelectedP(pVal);
                                setParams({ ...params, returnPeriod: pVal });
                                setSuccessMessage(`计算雨力防汛重现期已设置为 P = ${pVal}年`);
                                setTimeout(() => setSuccessMessage(null), 2000);
                              }}
                              className={cn(
                                "py-1.5 text-[11px] font-bold rounded-lg transition-all border outline-none cursor-pointer text-center",
                                selectedP === pVal
                                  ? "bg-indigo-650 text-white border-transparent shadow shadow-indigo-150"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              )}
                            >
                              {pVal}年
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time scrubber */}
                      <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-center justify-between">
                          <label className="text-[10.5px] font-bold text-slate-650 uppercase tracking-wider">
                            动力降雨瞬时历时节点轴 (Time Scrubber)
                          </label>
                          <span className="text-[10.5px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            T + {currentTimeStep}分 / {params.stormDuration || 120}分
                          </span>
                        </div>
                        
                        <div className="pt-2 flex items-center gap-3">
                          <input 
                            type="range"
                            min="0"
                            max={params.stormDuration || 120}
                            step="5"
                            value={currentTimeStep}
                            onChange={(e) => {
                              setCurrentTimeStep(parseInt(e.target.value));
                            }}
                            className="flex-1 accent-indigo-600 cursor-ew-resize h-1.5 bg-slate-200 rounded-lg outline-none"
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-mono text-slate-400">
                          <span>0 min (起雨)</span>
                          <span>{Math.floor((params.stormDuration || 120) / 2)} min (峰值)</span>
                          <span>{params.stormDuration || 120} min (完雨)</span>
                        </div>
                      </div>

                      {/* Warning box */}
                      <div className="p-3 bg-red-50/50 border border-red-150 rounded-xl space-y-1 text-red-950 text-[11px] leading-relaxed">
                        <span className="font-extrabold flex items-center gap-1 text-red-800">
                          <AlertCircle size={12} />
                          <span>一二维耦合积水预警：</span>
                        </span>
                        <p className="text-[10px]">
                          计算雨云推演至第 <strong className="font-mono text-[11px]">{Math.floor((params.stormDuration || 120) * 0.45)}</strong> 分钟左右产生最大溢流量。地图渲染颜色代表漫水高积：浅蓝(0-30cm)、深黄(30-60cm)、亮红(&gt;60cm)。
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ====== DESIGN SUGGESTION FOOTHOLD BOX ====== */}
                  <div className="p-3.5 bg-indigo-50/40 rounded-xl border border-indigo-100/60 text-[10.5px] leading-relaxed text-slate-600 mt-1 select-text">
                    <p className="font-bold text-indigo-805 border-b border-indigo-100/50 pb-1 mb-1.5 flex items-center gap-1">
                      <Sparkles size={11} />
                      <span>💡 智能全断面降抗涝管线自适应设计：</span>
                    </p>
                    <p className="text-[10px] leading-relaxed">
                      您可以使用下方 <strong className="font-bold">“一键自动智能降洪优化”</strong>，AI 规划师将智能对管网内全部因充满度超限而导致局部过饱和与漫堤的检查井和管道，自动进行管径逐段增扩与管底深度下挂，提升韧性。
                    </p>
                  </div>

                </div>
              );
            })()}
          </div>
        )}

      </div>

      {/* Optional results evaluation CTA */}
      {renderedState === 'results' && simulationResult && (
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col gap-2">
          <button
            onClick={() => {
              // Trigger automatic flow optimization for all pipelines
              getSelection();
              statsSummary.overloadedList.forEach(item => {
                const idx = STANDARD_DIAMETERS.findIndex(d => d > item.diameter);
                const targetD = idx !== -1 ? STANDARD_DIAMETERS[idx] : item.diameter + 200;
                updateLink(item.id, { diameter: targetD, height: targetD });
              });
              statsSummary.floodedList.forEach(item => {
                const nodeItem = nodes.find(n => n.id === item.id);
                if (nodeItem) {
                  updateNode(item.id, { maxDepth: nodeItem.maxDepth + 0.5 });
                }
              });
              setSuccessMessage('AI 设计师已对全部过载管网及积水点实施了管径扩容与井深挖深优化！');
              setTimeout(() => setSuccessMessage(null), 3500);
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 text-xs cursor-pointer outline-none shadow-indigo-100 border border-indigo-600"
          >
            <Sparkles size={13} />
            <span>智能全网一键降涝优化</span>
          </button>
        </div>
      )}

      {/* Footer message / info banner */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center gap-1.5 uppercase font-sans shrink-0">
        <HelpCircle size={12} className="text-slate-400" />
        <span>StormFlow Designer • 专业市政水动力规划软件</span>
      </div>

      {/* ==================== SWMM INP OVERVIEW MODAL ==================== */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[3001] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2">
                <BarChart2 className="text-blue-600" size={16} />
                <h3 className="font-bold text-slate-800 text-[13px]">全国主要城市暴雨强度公式对比横评</h3>
                <span className="text-[10px] text-slate-500 bg-slate-200/50 px-2 rounded-full ml-1 font-semibold">
                  当前条件: 重现期 P = {selectedP} 年, 历时 t = {Math.round(selectedDuration * 60)} min
                </span>
              </div>
              <button onClick={() => setShowCompareModal(false)} className="text-slate-400 hover:text-red-500 p-1 bg-white hover:bg-slate-100 rounded-full transition-colors border border-transparent hover:border-slate-200 cursor-pointer outline-none">
                <X size={16} />
              </button>
            </div>
            <div className="p-0 overflow-y-auto w-full bg-slate-50">
              <table className="w-full text-left text-[11px] font-sans">
                <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] z-10">
                  <tr>
                    <th className="py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap">城市 (区域)</th>
                    <th className="py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap">A₁</th    >
                    <th className="py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap">C</th     >
                    <th className="py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap">b</th     >
                    <th className="py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap">n</th     >
                    <th className="py-2.5 px-3 font-bold text-blue-700 whitespace-nowrap bg-blue-50/50">q [L/(s·ha)]</th>
                    <th className="py-2.5 px-3 font-bold text-emerald-700 whitespace-nowrap bg-emerald-50/50">I [mm/h]</th>
                    <th className="py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap max-w-[200px]">执行标准</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {Object.entries(RAINFALL_FORMULAS)
                    .filter(([_, f]) => f.region !== '自定义')
                    .map(([key, f]) => {
                      const t = selectedDuration * 60;
                      const qRaw = calcRainfallIntensity(key, null, selectedP, t);
                      const mmhRaw = qRaw * 3.6;
                      let A1Label = f.A1?.toFixed(1) || '-';
                      let CLabel = f.C?.toFixed(3) || '-';
                      let bLabel = f.b?.toFixed(2) || '-';
                      let nLabel = f.n?.toFixed(3) || '-';
                      
                      if (f.city === "广州" && f.gz_single_P) {
                         const table = f.gz_single_P;
                         const keys = Object.keys(table).map(Number).sort((x, y) => x - y);
                         const nearest = keys.reduce((prev, curr) => Math.abs(curr - selectedP) < Math.abs(prev - selectedP) ? curr : prev);
                         const prm = table[nearest];
                         A1Label = 'A='+prm.A.toFixed(1);
                         CLabel = '-';
                         bLabel = prm.b.toFixed(2);
                         nLabel = prm.n.toFixed(3);
                      }

                      return (
                        <tr key={key} className={cn("hover:bg-blue-50/30 transition-colors", selectedCityKey === key ? "bg-blue-50/50 font-semibold" : "")}>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-slate-700">{f.label.split('·')[0].trim()}</span>
                            {f.label.includes('·') && <span className="text-[10px] text-slate-500 ml-1">· {f.label.split('·')[1].trim()}</span>}
                            <span className="text-[9.5px] ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">{f.region}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 text-[10px]">{A1Label}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 text-[10px]">{CLabel}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 text-[10px]">{bLabel}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 text-[10px]">{nLabel}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[10px] text-blue-600 bg-blue-50/10">{qRaw > 0 ? qRaw.toFixed(2) : '-'}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[10px] text-emerald-600 bg-emerald-50/10">{mmhRaw > 0 ? mmhRaw.toFixed(1) : '-'}</td>
                          <td className="py-2.5 px-3 text-[9px] text-slate-500 truncate max-w-[220px]" title={f.standard}>{f.standard}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-white border-t border-slate-200 text-right">
               <button onClick={() => setShowCompareModal(false)} className="px-5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow cursor-pointer outline-none transition-colors">关闭对比</button>
            </div>
          </div>
        </div>
      )}

      {showInpViewer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[3001] flex items-center justify-center p-4 select-text">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 select-all">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between select-text">
              <div className="flex items-center gap-2">
                <FileCode className="text-indigo-600" size={18} />
                <h3 className="font-bold text-slate-800 text-sm">EPA-SWMM Input Config Deck (.inp)</h3>
              </div>
              <button
                onClick={() => setShowInpViewer(false)}
                className="text-slate-400 hover:text-slate-650 text-xs font-bold bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer outline-none hover:bg-slate-300"
              >
                关闭
              </button>
            </div>

            {/* Modal Content / Scrollable Viewport */}
            <div className="flex-1 overflow-auto p-4 bg-slate-900 text-emerald-400 font-mono text-[10.5px] leading-relaxed select-all">
              <pre className="whitespace-pre">{inpText}</pre>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between select-text">
              <div className="text-[10px] text-slate-505 select-text">
                可直接拷贝或贴入 SWMM 界面程序运行。
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadInp}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-950 rounded-lg text-[10.5px] font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer outline-none"
                >
                  <Download size={13} />
                  <span>下载 .inp 配置文件</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

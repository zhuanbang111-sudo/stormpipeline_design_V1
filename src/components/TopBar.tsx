import { Settings, Download, Upload, FileText, Undo2, Redo2, CloudRain, Lock, Circle, CircleDot, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

interface TopBarProps {
  activeTab: 'modeling' | 'rainfall' | 'simulation' | 'evaluation';
  onTabChange: (tab: 'modeling' | 'rainfall' | 'simulation' | 'evaluation') => void;
  onOpenSettings: () => void;
  onOpenImport: () => void;
  onExportDXF: () => void;
  onExportReport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  nodes?: any[];
  links?: any[];
  catchments?: any[];
  simulationParams?: any;
  simulationResult?: any;
}

export default function TopBar({
  activeTab,
  onTabChange,
  onOpenSettings,
  onOpenImport,
  onExportDXF,
  onExportReport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  nodes = [],
  links = [],
  catchments = [],
  simulationParams,
  simulationResult = null
}: TopBarProps) {
  const tabs = [
    { id: 'modeling', label: '① 网络建模' },
    { id: 'rainfall', label: '② 降雨条件' },
    { id: 'simulation', label: '③ 运行计算' },
    { id: 'evaluation', label: '④ 结果评估' }
  ] as const;

  const steps = [
    { id: 'modeling', label: '建模' },
    { id: 'rainfall', label: '降雨' },
    { id: 'simulation', label: '计算' },
    { id: 'evaluation', label: '结果' }
  ] as const;

  // Tooltip tracking state
  const [tooltipState, setTooltipState] = useState<{ stepId: string; message: string } | null>(null);
  const [activeTimer, setActiveTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (activeTimer) clearTimeout(activeTimer);
    };
  }, [activeTimer]);

  const getStepState = (stepId: 'modeling' | 'rainfall' | 'simulation' | 'evaluation'): 'locked' | 'ready' | 'active' | 'done' => {
    // Step 1: 建模
    if (stepId === 'modeling') {
      if (activeTab === 'modeling') return 'active';
      return 'done';
    }

    // Step 2: 降雨
    const step2PrereqMet = (catchments?.length ?? 0) >= 1 && (links?.length ?? 0) >= 1;
    if (stepId === 'rainfall') {
      if (!step2PrereqMet) return 'locked';
      if (activeTab === 'rainfall') return 'active';
      if (activeTab === 'simulation' || activeTab === 'evaluation') return 'done';
      return 'ready';
    }

    // Step 3: 计算
    const step3PrereqMet = step2PrereqMet && (simulationParams?.returnPeriod ?? 0) > 0 && !!(simulationParams?.rainType);
    if (stepId === 'simulation') {
      if (!step3PrereqMet) return 'locked';
      if (activeTab === 'simulation') return 'active';
      if (activeTab === 'evaluation') return 'done';
      return 'ready';
    }

    // Step 4: 结果
    const step4PrereqMet = step3PrereqMet && (simulationResult !== null || activeTab === 'evaluation');
    if (stepId === 'evaluation') {
      if (!step4PrereqMet) return 'locked';
      if (activeTab === 'evaluation') return 'active';
      return 'done';
    }

    return 'locked';
  };

  const getLockReason = (stepId: 'modeling' | 'rainfall' | 'simulation' | 'evaluation'): string | null => {
    if (stepId === 'rainfall') {
      const pipeCount = links?.length ?? 0;
      const catCount = catchments?.length ?? 0;
      if (catCount === 0 || pipeCount === 0) {
        return "请先在大地图上绘制至少一个子汇水区和一段管线";
      }
    }
    if (stepId === 'simulation') {
      const pipeCount = links?.length ?? 0;
      const catCount = catchments?.length ?? 0;
      if (catCount === 0 || pipeCount === 0) {
        return "请先在大地图上绘制至少一个子汇水区和一段管线";
      }
      const hasReturnPeriod = (simulationParams?.returnPeriod ?? 0) > 0;
      const hasRainType = !!(simulationParams?.rainType);
      if (!hasReturnPeriod || !hasRainType) {
        return "请先配置降雨设计参数（重现期及设计雨型）";
      }
    }
    if (stepId === 'evaluation') {
      const pipeCount = links?.length ?? 0;
      const catCount = catchments?.length ?? 0;
      if (catCount === 0 || pipeCount === 0) {
        return "请先在大地图上绘制至少一个子汇水区和一段管线";
      }
      const hasReturnPeriod = (simulationParams?.returnPeriod ?? 0) > 0;
      const hasRainType = !!(simulationParams?.rainType);
      if (!hasReturnPeriod || !hasRainType) {
        return "请先配置极值波形与降雨量参数";
      }
      if (simulationResult === null) {
        return "请先在【运行计算】中启动并成功执行水力计算模拟";
      }
    }
    return null;
  };

  const handleStepClick = (stepId: 'modeling' | 'rainfall' | 'simulation' | 'evaluation') => {
    const state = getStepState(stepId);
    if (state === 'locked') {
      const reason = getLockReason(stepId) || "前置约束条件未满足";
      if (activeTimer) clearTimeout(activeTimer);
      setTooltipState({ stepId, message: reason });
      const timer = setTimeout(() => {
        setTooltipState(null);
      }, 3000);
      setActiveTimer(timer);
    } else {
      setTooltipState(null);
      onTabChange(stepId);
    }
  };

  const renderStepIcon = (state: 'locked' | 'ready' | 'active' | 'done') => {
    switch (state) {
      case 'locked':
        return <Lock size={11} className="text-slate-400 shrink-0" />;
      case 'ready':
        return <Circle size={10} className="text-blue-500 fill-none shrink-0" />;
      case 'active':
        return <CircleDot size={12} className="text-white fill-white shrink-0" />;
      case 'done':
        return <Check size={11} className="text-emerald-600 stroke-[3.5] shrink-0" />;
    }
  };

  return (
    <div id="top-navigation-bar" className="h-[48px] bg-white border-b border-[#e5e5e5] flex items-center justify-between px-4 z-25 select-none shrink-0">
      {/* Left section: App Logo + Workflow Progress Indicator + Workflow Phase Tabs */}
      <div className="flex items-center gap-5 h-full">
        <div className="flex items-center gap-2 mr-1">
          <div className="bg-[#185FA5] p-1 rounded-md">
            <CloudRain size={16} className="text-white" />
          </div>
          <span className="font-bold text-[14px] text-slate-800 tracking-tight">StormFlow Designer</span>
        </div>

        {/* 2.2 Workflow Progress Indicator */}
        <div className="flex items-center gap-1.5 h-full mr-1">
          {steps.map((step, idx) => {
            const state = getStepState(step.id);
            const isLast = idx === steps.length - 1;
            
            // Connected line states checking: S1 -> S2 (check S1 isDone), S2 -> S3 (check S2 isDone), etc.
            const nextStep = steps[idx + 1];
            const isConnectorActive = nextStep ? getStepState(step.id) === 'done' : false;

            return (
              <div key={step.id} className="flex items-center relative">
                {/* Step Pill */}
                <button
                  id={`step-indicator-pill-${step.id}`}
                  onClick={() => handleStepClick(step.id)}
                  className={cn(
                    "h-[28px] max-w-[80px] w-[72px] shrink-0 rounded-full flex items-center justify-center gap-1 text-[11px] font-sans border transition-all select-none cursor-pointer relative outline-none focus:outline-none",
                    state === 'locked' && "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed",
                    state === 'ready' && "bg-blue-50/50 text-blue-600 border-blue-200 hover:bg-blue-105 transition-all",
                    state === 'active' && "bg-[#185FA5] text-white border-[#185FA5] shadow-[0_2px_6px_rgba(24,95,165,0.25)] font-semibold",
                    state === 'done' && "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 transition-all font-medium"
                  )}
                  aria-label={`${step.label} step`}
                >
                  {renderStepIcon(state)}
                  <span>{step.label}</span>
                </button>

                {/* Micro Tooltip */}
                {tooltipState && tooltipState.stepId === step.id && (
                  <div className="absolute top-[34px] left-1/2 -translate-x-1/2 z-[3000] bg-slate-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-2xl w-56 text-left border border-slate-800 leading-normal animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Tooltip notch */}
                    <div className="absolute top-[-4px] left-1/4 translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 border-l border-t border-slate-800"></div>
                    <p className="font-semibold text-[10px] text-blue-400 mb-0.5">⚠️ 前置条件未满足</p>
                    <p className="text-slate-200 font-sans">{tooltipState.message}</p>
                  </div>
                )}

                {/* Connection Line */}
                {!isLast && (
                  <div 
                    className={cn(
                      "w-[20px] h-[2px] mx-1 transition-all rounded",
                      isConnectorActive ? "bg-emerald-500" : "bg-slate-250 bg-gray-200"
                    )} 
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Visual vertical bar */}
        <div className="h-5 w-[1px] bg-slate-200 mx-2"></div>

        {/* Workflow Phase Tabs */}
        <div className="flex items-center h-full">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const tabState = getStepState(tab.id);
            
            return (
              <button
                key={tab.id}
                id={`workflow-tab-${tab.id}`}
                onClick={() => handleStepClick(tab.id)}
                className={cn(
                  "h-[48px] px-3 text-[13px] flex items-center justify-center transition-all bg-transparent border-t-2 border-t-transparent border-b-2 rounded-none cursor-pointer select-none font-sans outline-none focus:outline-none relative",
                  isActive 
                    ? "border-b-[#185FA5] text-[#185FA5] font-semibold" 
                    : tabState === 'locked'
                      ? "border-b-transparent text-slate-350 opacity-60 cursor-not-allowed hover:text-slate-400 font-normal"
                      : "border-b-transparent text-slate-500 hover:text-slate-800 font-normal"
                )}
                aria-label={tab.label}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Separator | */}
      <div className="flex items-center gap-4 h-full pr-1">
        <div className="text-slate-300 text-sm opacity-60">|</div>

        {/* Right section: Utility Actions + Undo / Redo */}
        <div className="flex items-center gap-1.5 h-full">
          {/* Undo Button (Icon-Only) */}
          <button
            id="action-undo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            className={cn(
              "p-1.5 rounded transition-colors flex items-center justify-center outline-none cursor-pointer",
              canUndo ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100" : "text-slate-300 cursor-not-allowed"
            )}
            title="撤销 (Undo)"
            aria-label="撤销"
          >
            <Undo2 size={16} />
          </button>

          {/* Redo Button (Icon-Only) */}
          <button
            id="action-redo-btn"
            onClick={onRedo}
            disabled={!canRedo}
            className={cn(
              "p-1.5 rounded transition-colors flex items-center justify-center outline-none cursor-pointer",
              canRedo ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100" : "text-slate-300 cursor-not-allowed"
            )}
            title="重做 (Redo)"
            aria-label="重做"
          >
            <Redo2 size={16} />
          </button>

          {/* Small Vertical Divider */}
          <div className="w-[1px] h-3.5 bg-slate-200 mx-1"></div>

          {/* Import Button */}
          <button
            id="action-import-btn"
            onClick={onOpenImport}
            className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-[13px] font-normal transition-colors cursor-pointer outline-none"
            aria-label="导入数据"
          >
            <Upload size={14} className="text-slate-500" />
            <span>导入</span>
          </button>

          {/* Export DXF Button */}
          <button
            id="action-export-dxf-btn"
            onClick={onExportDXF}
            className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-[13px] font-normal transition-colors cursor-pointer outline-none"
            title="导出为 DXF 格式 (CGCS2000 投影)"
            aria-label="导出 DXF"
          >
            <Download size={14} className="text-slate-500" />
            <span>导出 DXF</span>
          </button>

          {/* Report Button */}
          <button
            id="action-report-btn"
            onClick={onExportReport}
            className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-[13px] font-normal transition-colors cursor-pointer outline-none"
            aria-label="生成报告"
          >
            <FileText size={14} className="text-slate-500" />
            <span>报告</span>
          </button>

          {/* Settings Button */}
          <button
            id="action-settings-btn"
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-[13px] font-normal transition-colors cursor-pointer outline-none"
            aria-label="系统设置"
          >
            <Settings size={14} className="text-slate-500" />
            <span>设置</span>
          </button>
        </div>
      </div>
    </div>
  );
}

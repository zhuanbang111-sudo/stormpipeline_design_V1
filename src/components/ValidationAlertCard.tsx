import React, { useState } from 'react';
import { 
  AlertTriangle, 
  HelpCircle, 
  TrendingUp, 
  ArrowRightLeft, 
  Sparkles, 
  Maximize2, 
  ArrowRight, 
  AlertCircle,
  HelpCircle as QuestionIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu
} from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import { SanityAnomaly } from '../engine/PipelineSanityChecker';

interface ValidationAlertCardProps {
  anomaly: SanityAnomaly;
  onSelectLink?: (linkId: string) => void;
}

const ValidationAlertCard: React.FC<ValidationAlertCardProps> = ({ anomaly, onSelectLink }) => {
  const { reverseLinkDirection, autoMatchDownstreamDiameter } = usePipelineStore();
  const [justFixed, setJustFixed] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleReverseClick = () => {
    setJustFixed(true);
    reverseLinkDirection(anomaly.linkId);
    setTimeout(() => setJustFixed(false), 2000);
  };

  const handleResizeClick = () => {
    setJustFixed(true);
    autoMatchDownstreamDiameter(anomaly.linkId);
    setTimeout(() => setJustFixed(false), 2000);
  };

  // Determine styling based on error/warning types
  const isError = anomaly.severity === 'error';
  const isReversed = anomaly.type === 'reversed_draw';
  
  let cardBorder = "border-amber-500/30 bg-amber-500/5";
  let badgeColor = "bg-amber-400/10 text-amber-400 border border-amber-400/30";
  let accentText = "text-amber-400";
  let animatePingColor = "bg-amber-400";

  if (isReversed) {
    cardBorder = "border-blue-500/30 bg-blue-500/5";
    badgeColor = "bg-blue-400/10 text-blue-400 border border-blue-400/30";
    accentText = "text-blue-400";
    animatePingColor = "bg-blue-400";
  } else if (anomaly.type === 'shrinkage_error') {
    cardBorder = "border-red-500/30 bg-red-500/5";
    badgeColor = "bg-red-400/10 text-red-400 border border-red-400/30";
    accentText = "text-red-400";
    animatePingColor = "bg-red-400";
  }

  return (
    <div 
      className={`border p-3.5 rounded-xl transition-all duration-300 relative overflow-hidden backdrop-blur-md flex flex-col gap-2.5 ${cardBorder} ${
        justFixed ? 'opacity-40 pointer-events-none translate-x-2' : ''
      }`}
    >
      {/* Background visual water mark */}
      <div className="absolute right-2 top-2 opacity-[0.03] pointer-events-none text-slate-100">
        <Cpu size={56} />
      </div>

      {/* Header and badges */}
      <div className="flex justify-between items-start gap-1 pb-1 border-b border-white/5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded ${badgeColor} flex items-center gap-1`}>
            <span className={`w-1 h-1 rounded-full ${animatePingColor} animate-pulse`} />
            {isReversed ? '流向逆转异常' : anomaly.type === 'shrinkage_error' ? '断头卡脖子大接小' : '陡坡合理径缩'}
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            {anomaly.downstreamLinkName}
          </span>
        </div>
        
        <button 
          onClick={() => setDetailOpen(!detailOpen)}
          className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-0.5 transition-colors"
        >
          {detailOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {detailOpen ? '折叠' : '数学演算'}
        </button>
      </div>

      {/* Main text description */}
      <div className="space-y-1">
        <h5 onClick={() => onSelectLink?.(anomaly.linkId)} className="text-xs font-bold text-slate-100 hover:underline cursor-pointer transition-all flex items-center gap-1">
          {anomaly.title}
        </h5>
        <p className="text-[11px] text-slate-300 leading-relaxed font-sans font-medium">
          {anomaly.description}
        </p>
      </div>

      {/* Math formulation and elevation diagrams if toggled open */}
      <div className={`transition-all duration-300 overflow-hidden text-[10px] font-mono leading-relaxed space-y-1.5 border-t border-white/5 pt-2 ${
        detailOpen ? 'max-h-[220px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
      }`}>
        <div className="bg-slate-950/50 rounded-lg p-2.5 space-y-1.5 border border-white/5">
          <div className="flex justify-between border-b border-white/5 pb-1 text-slate-400">
            <span>物理指标</span>
            <span>测定数值</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-zinc-500">上游管径 (D_up)</span>
            <span className="text-slate-300 font-bold">{anomaly.metrics.upstreamDiameter} mm</span>
          </div>

          <div className="flex justify-between">
            <span className="text-zinc-500">下游管径 (D_down)</span>
            <span className="text-slate-300 font-bold">{anomaly.metrics.downstreamDiameter} mm</span>
          </div>

          <div className="flex justify-between">
            <span className="text-zinc-500">上游管线坡度 (I_up)</span>
            <span className="text-slate-300">{(anomaly.metrics.upstreamSlope * 1000).toFixed(1)} ‰</span>
          </div>

          <div className="flex justify-between font-bold">
            <span className="text-zinc-500">下游管线坡度 (I_down)</span>
            <span className={anomaly.metrics.downstreamSlope > anomaly.metrics.upstreamSlope ? 'text-emerald-400' : 'text-slate-300'}>
              {(anomaly.metrics.downstreamSlope * 1000).toFixed(1)} ‰ {anomaly.metrics.downstreamSlope > anomaly.metrics.upstreamSlope ? '↑ (坡度变陡)' : ''}
            </span>
          </div>

          {/* Flow rates evaluation section */}
          <div className="border-t border-white/5 pt-1.5 space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500">上游累积汇合流量 (Q_actual)</span>
              <span className="text-cyan-400 font-semibold">{anomaly.metrics.actualFlow.toFixed(3)} m³/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">下游满管流过流量能力 (Q_cap)</span>
              <span className="text-amber-400 font-semibold">{anomaly.metrics.capacityDownstream.toFixed(3)} m³/s</span>
            </div>
          </div>

          {/* Elevation specific diagrams */}
          {anomaly.metrics.upGroundElev !== undefined && anomaly.metrics.downGroundElev !== undefined && (
            <div className="border-t border-white/5 pt-1.5 flex justify-between text-[9px] text-zinc-400">
              <span>井A地面: {anomaly.metrics.upGroundElev.toFixed(2)}m</span>
              <ArrowRight size={10} className="mt-0.5" />
              <span>井B地面: {anomaly.metrics.downGroundElev.toFixed(2)}m</span>
            </div>
          )}
        </div>
      </div>

      {/* High-interactability instant actions buttons bar */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
        {isReversed ? (
          <button
            onClick={handleReverseClick}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg shadow transition-all flex items-center gap-1"
            title="调换源井(Source)与目标井(Target)的拓扑端点，瞬间顺畅排水方向"
          >
            <ArrowRightLeft size={11} />
            一键反转流向 (Flip Direction)
          </button>
        ) : anomaly.type === 'shrinkage_error' ? (
          <button
            onClick={handleResizeClick}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 text-[10px] font-extrabold rounded-lg shadow-md transition-all flex items-center gap-1"
            title="自动匹配上游管线的最大管径，彻底解除节点卡脖子排水拥堵工况"
          >
            <Maximize2 size={11} />
            一键放大管径对齐 (Match Diameter)
          </button>
        ) : (
          <span className="text-[10px] text-emerald-400/90 font-medium flex items-center gap-1 py-1">
            <Check size={11} className="text-emerald-400" /> 符合水力坡降规范，免于改造
          </span>
        )}
      </div>

    </div>
  );
};

export default ValidationAlertCard;

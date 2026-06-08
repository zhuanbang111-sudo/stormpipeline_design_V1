import React from 'react';

interface FormulaDisplayProps {
  engine: 'rational' | 'dynamic';
}

const FormulaDisplay: React.FC<FormulaDisplayProps> = ({ engine }) => {
  const isRational = engine === 'rational';

  return (
    <div
      id="formula-display-card"
      className={`border rounded-xl p-3.5 transition-all duration-150 font-mono text-xs ${
        isRational
          ? 'bg-blue-50/40 dark:bg-blue-950/10 border-blue-200/60 dark:border-blue-900/40 border-l-[3px] border-l-blue-600'
          : 'bg-teal-50/40 dark:bg-teal-950/10 border-teal-200/60 dark:border-teal-900/40 border-l-[3px] border-l-teal-600'
      }`}
    >
      {isRational ? (
        <div className="space-y-3 animate-fadeIn">
          {/* Title Area */}
          <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/30 pb-1.5 shadow-none">
            <span className="text-[11px] font-black text-blue-800 dark:text-blue-400 font-sans tracking-wide">
              推理公式法计算理学模型 (Rational Formula)
            </span>
            <span className="text-[9.5px] font-bold text-blue-500 dark:text-blue-500">
              静态分析
            </span>
          </div>

          {/* Primary Formula Section */}
          <div className="py-2.5 text-center bg-white/60 dark:bg-zinc-950/40 rounded-lg border border-blue-100/50 dark:border-blue-950/50">
            <span className="text-[13px] font-extrabold text-blue-950 dark:text-blue-200 tracking-wider">
              Q = (C &times; I &times; A) / 360
            </span>
          </div>

          {/* Variables glossary: 2-column grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 font-sans">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">Q</span>
              <span>设计流量 (L/s)</span>
            </div>
            <div className="flex items-center gap-1.5 flex-row">
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">C</span>
              <span>径流系数</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">I</span>
              <span>降雨强度 (mm/h)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">A</span>
              <span>汇水面积 (ha)</span>
            </div>
          </div>

          {/* Note section */}
          <div className="text-[10.5px] text-zinc-500 dark:text-zinc-500 font-sans pt-1 border-t border-blue-100/40 dark:border-blue-900/25 leading-relaxed">
            <span className="font-bold text-blue-800 dark:text-blue-400">适用：</span>
            初步管径设计，稳态假设，忽略管网调蓄。
          </div>
        </div>
      ) : (
        <div className="space-y-3 animate-fadeIn">
          {/* Title Area */}
          <div className="flex items-center justify-between border-b border-teal-100 dark:border-teal-900/30 pb-1.5 shadow-none">
            <span className="text-[11px] font-black text-teal-800 dark:text-teal-400 font-sans tracking-wide">
              圣维南方程组动力波模型 (Saint-Venant Equations)
            </span>
            <span className="text-[9.5px] font-bold text-teal-500 dark:text-teal-500">
              EPA-SWMM
            </span>
          </div>

          {/* Two-line Saint-Venant Equations */}
          <div className="py-2.5 px-2.5 bg-white/60 dark:bg-zinc-950/40 rounded-lg border border-teal-100/50 dark:border-teal-950/50 space-y-1.5 text-center leading-relaxed">
            <div className="text-[12px] font-extrabold text-teal-950 dark:text-teal-200 tracking-wide">
              &part;A/&part;t + &part;Q/&part;x = 0
            </div>
            <div className="text-[12px] font-extrabold text-teal-950 dark:text-teal-200 tracking-wide">
              &part;Q/&part;t + &part;(Q&sup2;/A)/&part;x + gA(&part;h/&part;x) = gA(S<sub>0</sub> &minus; S<sub>f</sub>)
            </div>
          </div>

          {/* Variables glossary: 2-column grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-300 font-sans">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">Q</span>
              <span>流量 (m&sup3;/s)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">A</span>
              <span>过水断面积 (m&sup2;)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">h</span>
              <span>水深 (m)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">S<sub>f</sub></span>
              <span>摩擦坡降</span>
            </div>
          </div>

          {/* Note section */}
          <div className="text-[10.5px] text-zinc-500 dark:text-zinc-550 font-sans pt-1 border-t border-teal-100/40 dark:border-teal-900/25 leading-relaxed">
            <span className="font-bold text-teal-800 dark:text-teal-400">适用：</span>
            精确水力校核，支持有压流、回水、超载模拟。
          </div>
        </div>
      )}
    </div>
  );
};

export default FormulaDisplay;

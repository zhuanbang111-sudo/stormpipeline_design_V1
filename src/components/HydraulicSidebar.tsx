import React from 'react';
import { SimulationParams } from '../engine/hydraulicEngine';
import { Activity, Play, Settings2, Info, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';

interface HydraulicSidebarProps {
  params: SimulationParams;
  setParams: (params: SimulationParams) => void;
  runSim: () => void;
}

const REGIONS = {
  western: {
    name: '深圳西部 (Western)',
    params: { A: 2698.815, C: 0.593, b: 11.03, n: 0.648 }
  },
  central: {
    name: '深圳中部 (Central)',
    params: { A: 2253.300, C: 0.647, b: 10.45, n: 0.627 }
  },
  eastern: {
    name: '深圳东部 (Eastern)',
    params: { A: 1914.800, C: 0.695, b: 9.84, n: 0.605 }
  },
  guangzhou: {
    name: '广州 (Guangzhou)',
    params: { A: 2446.700, C: 0.552, b: 11.70, n: 0.720 }
  },
  beijing: {
    name: '北京 (Beijing)',
    params: { A: 1602.0, C: 0.559, b: 9.0, n: 0.659 }
  },
  shanghai: {
    name: '上海 (Shanghai)',
    params: { A: 2434.0, C: 0.55, b: 12.0, n: 0.72 }
  },
  custom: {
    name: '自定义 (其他城市)',
    params: { A: 2000, C: 0.6, b: 10, n: 0.6 }
  }
};

export default function HydraulicSidebar({ params, setParams, runSim }: HydraulicSidebarProps) {
  const updateParam = (key: keyof SimulationParams, value: any) => {
    setParams({ ...params, [key]: value });
  };

  const updateFormulaParam = (key: keyof SimulationParams['formulaParams'], value: number) => {
    setParams({
      ...params,
      formulaParams: { ...params.formulaParams, [key]: value }
    });
  };

  const handleRegionChange = (region: keyof typeof REGIONS) => {
    setParams({
      ...params,
      region,
      formulaParams: { ...REGIONS[region].params }
    });
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full shadow-sm z-10">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <Activity size={18} className="text-blue-600" />
          Hydraulic Engine
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Calculation Method */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Settings2 size={14} />
            Calculation Method (核心计算手段)
          </label>
          <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => updateParam('method', 'rational')}
              className={cn(
                "py-1.5 px-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all",
                params.method === 'rational'
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-200"
              )}
            >
              推理公式
            </button>
            <button
              onClick={() => updateParam('method', 'constant')}
              className={cn(
                "py-1.5 px-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all",
                params.method === 'constant'
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-200"
              )}
            >
              恒定强度
            </button>
            <button
              onClick={() => {
                updateParam('method', 'chicago');
                if (!params.chicagoParams) {
                  setParams({
                    ...params,
                    method: 'chicago',
                    chicagoParams: { r: 0.4 }
                  });
                }
              }}
              className={cn(
                "py-1.5 px-1.5 text-[10px] sm:text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-0.5",
                params.method === 'chicago'
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-200"
              )}
            >
              🌧️ 芝加哥雨型
            </button>
          </div>
        </div>

        {/* Chicago Rain Formula Parameters */}
        {params.method === 'chicago' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <MapPin size={14} />
                Region Selection
              </label>
              <select
                value={params.region}
                onChange={(e) => handleRegionChange(e.target.value as any)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {Object.entries(REGIONS).map(([key, region]) => (
                  <option key={key} value={key}>{region.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4 p-4 bg-sky-50 rounded-xl border border-sky-150">
              <div className="flex items-center gap-2 text-sky-800 font-semibold text-sm">
                <Info size={14} />
                Chicago Rain Formulas (暴雨公式)
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-sky-700 mb-1">Parameter A</label>
                  <input
                    type="number"
                    value={params.formulaParams.A}
                    onChange={e => updateFormulaParam('A', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-sky-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-sky-700 mb-1">Parameter C</label>
                  <input
                    type="number"
                    value={params.formulaParams.C}
                    onChange={e => updateFormulaParam('C', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-sky-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-sky-700 mb-1">Parameter b (min)</label>
                  <input
                    type="number"
                    value={params.formulaParams.b}
                    onChange={e => updateFormulaParam('b', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-sky-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-sky-700 mb-1">Parameter n</label>
                  <input
                    type="number"
                    value={params.formulaParams.n}
                    onChange={e => updateFormulaParam('n', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-sky-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-sky-150">
                <div>
                  <label className="block text-[11px] font-medium text-sky-700 mb-1">Return Period P (Years / 重现期)</label>
                  <input
                    type="number"
                    value={params.returnPeriod}
                    onChange={e => updateParam('returnPeriod', parseFloat(e.target.value) || 1)}
                    className="w-full bg-white border border-sky-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[11px] font-medium text-sky-700">峰度系数 r (峰值位置比例)</label>
                    <span className="text-xs font-mono font-bold text-sky-600">{params.chicagoParams?.r ?? 0.4}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={params.chicagoParams?.r ?? 0.4}
                    onChange={e => {
                      setParams({
                        ...params,
                        chicagoParams: { r: parseFloat(e.target.value) || 0.4 }
                      });
                    }}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] text-sky-500 font-mono">
                    <span>0.1 (峰前极早)</span>
                    <span>0.4 (雨峰居中)</span>
                    <span>0.9 (峰后极晚)</span>
                  </div>
                </div>
              </div>
              
              <div className="text-[9px] text-sky-600 leading-relaxed italic text-center font-semibold">
                雨峰时刻: {((params.chicagoParams?.r ?? 0.4) * params.stormDuration).toFixed(0)} min | 最大暴雨强: {((params.formulaParams.A * (1 + params.formulaParams.C * Math.log10(params.returnPeriod))) / Math.pow(params.formulaParams.b, params.formulaParams.n)).toFixed(1)} L/s·ha
              </div>
            </div>
          </div>
        )}

        {/* Shenzhen Formula Parameters */}
        {params.method === 'rational' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <MapPin size={14} />
                Region Selection
              </label>
              <select
                value={params.region}
                onChange={(e) => handleRegionChange(e.target.value as any)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {Object.entries(REGIONS).map(([key, region]) => (
                  <option key={key} value={key}>{region.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
                <Info size={14} />
                Formula Parameters
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-blue-700 mb-1">Parameter A</label>
                  <input
                    type="number"
                    value={params.formulaParams.A}
                    onChange={e => updateFormulaParam('A', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-blue-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-700 mb-1">Parameter C</label>
                  <input
                    type="number"
                    value={params.formulaParams.C}
                    onChange={e => updateFormulaParam('C', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-blue-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-700 mb-1">Parameter b</label>
                  <input
                    type="number"
                    value={params.formulaParams.b}
                    onChange={e => updateFormulaParam('b', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-blue-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-700 mb-1">Parameter n</label>
                  <input
                    type="number"
                    value={params.formulaParams.n}
                    onChange={e => updateFormulaParam('n', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-blue-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-blue-100">
                <div>
                  <label className="block text-[11px] font-medium text-blue-700 mb-1">Return Period P (Years)</label>
                  <input
                    type="number"
                    value={params.returnPeriod}
                    onChange={e => updateParam('returnPeriod', parseFloat(e.target.value) || 1)}
                    className="w-full bg-white border border-blue-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-blue-700 mb-1">折减系数 m (通常取1.2)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={params.delayCoefficient}
                    onChange={e => updateParam('delayCoefficient', parseFloat(e.target.value) || 1)}
                    className="w-full bg-white border border-blue-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              
              <div className="text-[10px] text-blue-600/80 leading-relaxed italic text-center">
                q = {params.formulaParams.A}(1+{params.formulaParams.C}lgP) / (t+{params.formulaParams.b})^{params.formulaParams.n}
              </div>
            </div>
          </div>
        )}

        {/* Constant Flow Parameters */}
        {params.method === 'constant' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rainfall Intensity (mm/hr)</label>
              <input
                type="number"
                value={params.rainfallIntensity}
                onChange={e => updateParam('rainfallIntensity', parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* General Parameters */}
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Simulation Duration (min)</label>
            <input
              type="number"
              value={params.stormDuration}
              onChange={e => updateParam('stormDuration', parseInt(e.target.value) || 60)}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={runSim}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Play size={18} fill="currentColor" />
          Run Simulation
        </button>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, CloudRain, RotateCw, AlertTriangle } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';

interface SettingsModalProps {
  onClose: () => void;
  onOpenCloudScenario: () => void;
}

export default function SettingsModal({ onClose, onOpenCloudScenario }: SettingsModalProps) {
  const store = usePipelineStore();
  
  const [nodePrefix, setNodePrefix] = useState('YS_');
  const [outfallPrefix, setOutfallPrefix] = useState('YS_OF_');
  const [startIndex, setStartIndex] = useState(1);

  const handleReorder = () => {
    if (window.confirm("此操作将覆盖所有现有编号，建议先导出备份。是否确认执行拓扑编码更名？")) {
      try {
        store.reorderNetworkTopology(nodePrefix, outfallPrefix, startIndex);
        alert("拓扑编码更名完成！");
      } catch (e) {
        console.error("Topology reorder failed:", e);
        alert("拓扑重命名失败，请查看控制台日志。");
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <h2 className="font-semibold text-gray-800">Simulation Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-5 space-y-6">
          {/* General Settings */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Map Base Layer (底图类型)</label>
              <select 
                value={store.simulationParams.mapType || 'tianditu_vec'}
                onChange={e => store.setSimulationParams({ ...store.simulationParams, mapType: e.target.value as any })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tianditu_vec">天地图 - 矢量 (默认)</option>
                <option value="tianditu_img">天地图 - 影像</option>
                <option value="osm">OpenStreetMap (Carto Light)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Select the base map for the design area.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Simulation Engine</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" defaultValue="rational">
                <option value="rational">Rational Method (Kinematic Wave)</option>
                <option value="swmm" disabled>EPA SWMM 5.1 (Coming Soon)</option>
                <option value="hec-ras" disabled>HEC-RAS (Coming Soon)</option>
              </select>
            </div>
          </div>

          {/* Topology Management */}
          <div className="pt-5 border-t border-gray-200 space-y-4">
            <div>
              <h3 className="block text-sm font-bold text-gray-700 mb-1">网络拓扑管理</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                自动识别源头节点及流向，将井编号规范化。<br/>
                关联管线及汇水区将穿透更新。
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">节点前缀</label>
                  <input 
                    type="text" 
                    value={nodePrefix}
                    onChange={e => setNodePrefix(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">排放口前缀</label>
                  <input 
                    type="text" 
                    value={outfallPrefix}
                    onChange={e => setOutfallPrefix(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">起始编号</label>
                <input 
                  type="number" 
                  min="1"
                  value={startIndex}
                  onChange={e => setStartIndex(parseInt(e.target.value) || 1)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleReorder}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium shadow-md rounded-lg py-2 text-sm hover:from-blue-700 hover:to-indigo-700 transition cursor-pointer"
                >
                  <RotateCw size={14} />
                  执行拓扑编码更名
                </button>
                <div className="mt-2.5 flex items-start gap-1.5 text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200/50">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <p className="text-[10px] leading-snug">此操作将覆盖所有现有编号，建议先在顶部菜单中导出备份。</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5 border-t border-gray-200 space-y-1.5">
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">云端方案管理 (Cloud Scenarios)</label>
            <button 
              onClick={onOpenCloudScenario}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold select-none cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-bold">
                <CloudRain size={13} className="text-indigo-600 animate-bounce" />
                <span>D1 云端剧本同步中心</span>
              </span>
              <span>配置器 &rarr;</span>
            </button>
            <p className="text-[10px] text-gray-500 leading-normal mb-2">
              配置并拉取保存在 AISTUDIO Cloudflare D1 分布式数据库的剧本数据。
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end sticky bottom-0">
          <button 
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

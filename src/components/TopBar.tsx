import { Settings, Download, Upload, FileText, Undo2, Redo2, CloudRain, Activity, Cpu, Database } from 'lucide-react';

// 定义 TopBar 组件接收 of 属性 (Props)
interface TopBarProps {
  onOpenSettings: () => void; // 打开设置弹窗的回调函数
  onOpenImport: () => void; // 打开导入弹窗的回调函数
  onExportDXF: () => void; // 导出 DXF
  onExportReport: () => void; // 导出报告
  onUndo: () => void; // 撤销操作的回调函数
  onRedo: () => void; // 重做操作的回调函数
  canUndo: boolean; // 是否可以撤销（用于控制按钮的禁用状态）
  canRedo: boolean; // 是否可以重做（用于控制按钮的禁用状态）
  onOpenChicago?: () => void; // 打开芝加哥雨型发生器的回调函数
  onOpenValidation?: () => void; // 打开校验侧边栏的回调函数
  showValidationPanel?: boolean; // 校验侧边栏是否处于显示状态
  onOpenAdaptiveCatchment?: () => void; // 打开自适应汇水区部署引擎的回调
  showAdaptiveCatchment?: boolean; // 自适应汇水区部署引擎是否处于显示状态
  onOpenCloudScenario?: () => void; // 打开云端剧本同步中心的回调
}

export default function TopBar({ 
  onOpenSettings, 
  onOpenImport, 
  onExportDXF, 
  onExportReport, 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo, 
  onOpenChicago,
  onOpenValidation,
  showValidationPanel = false,
  onOpenAdaptiveCatchment,
  showAdaptiveCatchment = false,
  onOpenCloudScenario
}: TopBarProps) {
  return (
    // 顶部导航栏容器
    <div className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 z-20 shadow-md">
      {/* 左侧区域：Logo 和 标题 */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 p-1.5 rounded-md">
          <CloudRain size={20} className="text-white" />
        </div>
        <h1 className="font-bold text-lg tracking-tight">StormFlow Designer V1</h1>
      </div>
      
      {/* 右侧区域：操作按钮组 */}
      <div className="flex items-center gap-2">
        {onOpenCloudScenario && (
          <button 
            onClick={onOpenCloudScenario}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20 hover:text-indigo-300 rounded transition-all border border-indigo-400/35 shadow-lg shadow-indigo-400/5 mr-1 cursor-pointer"
            title="一键保存/载入 Cloudflare D1 数据库剧本"
          >
            <Database size={15} className="animate-pulse" /> D1 云端剧本
          </button>
        )}

        {onOpenValidation && (
          <button 
            onClick={onOpenValidation}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded transition-all border shadow-lg mr-1 ${
              showValidationPanel 
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/10' 
                : 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 hover:text-emerald-300 border-emerald-400/35 shadow-emerald-400/5'
            }`}
          >
            <Activity size={15} className={showValidationPanel ? 'animate-pulse' : ''} /> 水力合规校验
          </button>
        )}

        {onOpenChicago && (
          <button 
            onClick={onOpenChicago}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 hover:text-amber-300 rounded transition-all border border-amber-400/35 shadow-lg shadow-amber-400/5 mr-1"
          >
            <CloudRain size={15} className="animate-bounce" /> 芝加哥雨型
          </button>
        )}

        {onOpenAdaptiveCatchment && (
          <button 
            onClick={onOpenAdaptiveCatchment}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded transition-all border shadow-lg mr-1 ${
              showAdaptiveCatchment 
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/10' 
                : 'text-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20 hover:text-indigo-300 border-indigo-400/35 shadow-indigo-400/5'
            }`}
          >
            <Cpu size={15} className={showAdaptiveCatchment ? 'animate-spin' : ''} /> 自适应汇水区
          </button>
        )}

        {/* 撤销按钮 */}
        <button 
          onClick={onUndo}
          disabled={!canUndo} // 如果不能撤销，则禁用按钮
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors ${canUndo ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'}`}
        >
          <Undo2 size={16} /> Undo
        </button>
        {/* 重做按钮 */}
        <button 
          onClick={onRedo}
          disabled={!canRedo} // 如果不能重做，则禁用按钮
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors ${canRedo ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'}`}
        >
          <Redo2 size={16} /> Redo
        </button>
        
        {/* 分隔线 */}
        <div className="w-px h-6 bg-slate-700 mx-2"></div>
        
        {/* 导入按钮 */}
        <button onClick={onOpenImport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
          <Upload size={16} /> Import
        </button>
        {/* 导出DXF按钮 */}
        <button 
          onClick={onExportDXF}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="导出为 DXF 格式 (CGCS2000 投影)"
        >
          <Download size={16} /> Export DXF
        </button>
        {/* 报告按钮 */}
        <button 
          onClick={onExportReport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          <FileText size={16} /> Reports
        </button>
        
        {/* 分隔线 */}
        <div className="w-px h-6 bg-slate-700 mx-2"></div>
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          <Settings size={16} /> Settings
        </button>
      </div>
    </div>
  );
}

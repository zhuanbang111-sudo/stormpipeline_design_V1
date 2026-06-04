import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  Upload, 
  Download, 
  Trash2, 
  RefreshCw, 
  Save, 
  Calendar, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Database,
  Search,
  Sparkles
} from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';

interface CloudScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CloudScenarioModal({ isOpen, onClose }: CloudScenarioModalProps) {
  const { 
    isSaving, 
    cloudScenarios, 
    fetchCloudScenarios, 
    syncScenarioToCloud, 
    loadCloudScenario, 
    deleteCloudScenario,
    nodes,
    links,
    catchments
  } = usePipelineStore();

  // Local state for the scenario metadata form
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Initialize name automatically with date stamp
  useEffect(() => {
    if (isOpen) {
      const dateStr = new Date().toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\//g, '-');
      setName(`管网孪生方案-${dateStr}`);
      setDescription('全栈自动校验与雨水水力数字孪生快照');
      setSaveSuccess(false);
      setErrorMessage(null);
      // Fetch cloud scenario list on open
      fetchCloudScenarios();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Sync snapshot
  const handleSaveToCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage("请输入合法的方案名称！");
      return;
    }
    setErrorMessage(null);
    setSaveSuccess(false);

    const success = await syncScenarioToCloud(name, description);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setErrorMessage("同步失败，请检查 Cloudflare Pages/D1 数据库绑定或网络状态。");
    }
  };

  // Load snapshot
  const handleLoad = async (id: string) => {
    setSelectedScenarioId(id);
    const success = await loadCloudScenario(id);
    if (success) {
      onClose();
    } else {
      setErrorMessage("回滚方案出错，数据库记录可能已损毁或无法检索。");
    }
    setSelectedScenarioId(null);
  };

  // Delete snapshot
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering load
    if (window.confirm("确定要在 Cloudflare D1 数据库中永久删除该管网剧本吗？本操作不可撤销！")) {
      const success = await deleteCloudScenario(id);
      if (!success) {
        setErrorMessage("删除云端数据发生异常。");
      }
    }
  };

  // Filter list
  const filteredScenarios = cloudScenarios.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Outer Modal container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col md:flex-row h-[85vh] md:h-[650px] relative animate-fade-in">
        
        {/* Close Button top right */}
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors bg-slate-850 p-1.5 rounded-lg z-10 border border-slate-800"
        >
          <X size={16} />
        </button>

        {/* Left Section: Create Snapshot / Synchronize */}
        <div className="w-full md:w-[40%] bg-slate-950/60 p-6 md:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800/80">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={11} className="animate-pulse" /> CLOUDFLARE PAGES FULLSTACK
              </span>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Cloud size={20} className="text-blue-500 shrink-0" />
                D1 数据库同步中心
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
                将当前图纸中的节点网络、管段高度、坡度数值、材质、汇水区范围要素以及模型数据一键归档到 D1 分布式云数据库中。
              </p>
            </div>

            <form onSubmit={handleSaveToCloud} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">当前孪生方案标题</label>
                <input 
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入方案标题"
                  className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-800 text-slate-100 text-xs font-semibold rounded-xl focus:border-indigo-500 focus:outline-none transition-all placeholder:text-slate-600"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">方案描述或变更备注</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="记录水力调整参数、Chicago雨强变跟、管道大接小治污防涝方案描述..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-800 text-slate-100 text-xs font-medium rounded-xl focus:border-indigo-500 focus:outline-none transition-all resize-none placeholder:text-slate-600 leading-relaxed"
                />
              </div>

              {saveSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5">
                  <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-emerald-400 font-bold">快照同步完美，历史列表已全自动更新！</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2.5">
                  <AlertCircle size={15} className="text-red-400 shrink-0" />
                  <span className="text-[11px] text-red-400 font-medium">{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className={`w-full flex items-center justify-center gap-2 hover:scale-[1.01] hover:brightness-110 active:scale-[0.99] transition-all bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl py-3 text-xs shadow-lg shadow-blue-500/10 cursor-pointer ${
                  isSaving ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Upload size={14} className={isSaving ? 'animate-bounce' : ''} />
                {isSaving ? '正在封装批量写入事务...' : '同步图表至 D1 数据库'}
              </button>
            </form>
          </div>

          <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>节点: {nodes.length} 个</span>
            <span>管线: {links.length} 条</span>
            <span>汇水区: {catchments.length} 块</span>
          </div>
        </div>

        {/* Right Section: Cloud History List & Load Controls */}
        <div className="w-full md:w-[60%] p-6 md:p-8 flex flex-col gap-4 overflow-hidden bg-slate-900/40">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-200">云端历史方案版本</h3>
              <span className="bg-slate-800 text-slate-400 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full">
                {cloudScenarios.length}
              </span>
            </div>
            
            <button 
              onClick={fetchCloudScenarios}
              className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 p-1.5 rounded-lg border border-slate-700/50 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="刷新云端数据库列表"
            >
              <RefreshCw size={12} className="text-indigo-400 animate-spin-slow" />
              刷新
            </button>
          </div>

          {/* Search filtering bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索方案名称、历史快照或方案描述标签..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-800 text-slate-100 text-xs font-semibold rounded-xl focus:border-indigo-500 focus:outline-none placeholder:text-slate-600 transition-all font-mono"
            />
          </div>

          {/* List display pane */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1 custom-scrollbar">
            {filteredScenarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-950/20 border border-slate-800/40 border-dashed rounded-xl">
                <Database size={28} className="text-slate-700 mb-2" />
                <p className="text-xs text-slate-500 font-bold">没有匹配的方案版本</p>
                <p className="text-[10px] text-slate-600 mt-0.5 max-w-[240px]">您可在左侧保存一份当前网络状态到 Cloudflare D1 进行备份</p>
              </div>
            ) : (
              filteredScenarios.map((scenario) => {
                const isLoading = selectedScenarioId === scenario.id;
                return (
                  <div 
                    key={scenario.id}
                    onClick={() => handleLoad(scenario.id)}
                    className="group border border-slate-800/60 hover:border-indigo-500/50 bg-slate-950/40 hover:bg-slate-950/80 p-3.5 rounded-xl transition-all duration-200 cursor-pointer flex justify-between items-center gap-4 relative overflow-hidden"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-100 truncate group-hover:text-indigo-400 transition-colors">
                          {scenario.name}
                        </span>
                      </div>
                      
                      {scenario.description && (
                        <p className="text-[11px] text-slate-400 truncate font-sans font-medium">
                          {scenario.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} className="text-slate-600" />
                          {new Date(scenario.created_at).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span className="text-slate-700">|</span>
                        <span className="text-[9px] uppercase tracking-wider text-slate-600 bg-slate-900 border border-slate-800/30 px-1.5 py-0.25 rounded font-bold">id: {scenario.id.substring(0, 8)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoad(scenario.id);
                        }}
                        disabled={isLoading}
                        className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-bold rounded-lg p-2 transition-all text-xs flex items-center gap-1 border border-indigo-500/20"
                        title="加载此数字孪生网络快照"
                      >
                        <Download size={13} className={isLoading ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">载入</span>
                      </button>

                      <button
                        onClick={(e) => handleDelete(scenario.id, e)}
                        className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white font-bold rounded-lg p-2 transition-all border border-red-500/20"
                        title="彻底删除该剧本记录"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="text-[10px] text-zinc-500 leading-relaxed bg-slate-950/20 border border-slate-800/40 rounded-xl p-3 flex items-start gap-2">
            <InfoIcon size={12} className="text-indigo-400 shrink-0 mt-0.5" />
            <p className font-medium>
              💡 <strong>什么是 Pages Functions 架构：</strong> Cloudflare Pages 自动在边缘网络（Edge workers）部署这一对 D1 的全栈 API。本地运行或部署云端时，前端均通过安全路由直接访问 API，并提供完全一致的、可瞬间加载和保存的历史孪生方案性能反馈。
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

function InfoIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

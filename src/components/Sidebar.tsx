import React, { useEffect, useState } from 'react';
import { ToolType } from '../types';
import { 
  Pointer, 
  CircleDot, 
  ArrowRightToLine, 
  Minus, 
  Pentagon, 
  Eraser, 
  Scan,
  Database,
  GitCommitHorizontal,
  Layers,
  ChevronUp,
  ChevronDown,
  Trash2,
  X,
  Search,
  ArrowUpDown,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { usePipelineStore, EnhancedNode, EnhancedLink, EnhancedCatchment } from '../store/usePipelineStore';
import { motion, AnimatePresence } from 'motion/react';
import StatefulNumberInput from './StatefulNumberInput';
import { PIPE_MATERIALS, SURFACE_TYPES } from '../constants';

interface SidebarProps {
  selectedTool: ToolType;
  selectedElement: { type: 'node' | 'link' | 'catchment', id: string } | null;
  setSelectedElement: (el: { type: 'node' | 'link' | 'catchment', id: string } | null) => void;
  nodes: EnhancedNode[];
  links: EnhancedLink[];
  catchments: EnhancedCatchment[];
  updateNode: (id: string, updates: Partial<EnhancedNode>) => void;
  updateLink: (id: string, updates: Partial<EnhancedLink>) => void;
  updateCatchment: (id: string, updates: Partial<EnhancedCatchment>) => void;
  deleteNode: (id: string) => void;
  deleteLink: (id: string) => void;
  deleteCatchment: (id: string) => void;
  clearBackgroundFeatures: () => void;
  backgroundFeaturesCount: number;
  defaultInvertElevation: number;
  setDefaultInvertElevation: (val: number) => void;
  defaultGroundElevation: number;
  setDefaultGroundElevation: (val: number) => void;
  generateVoronoiCatchments: () => void;
}

export default function Sidebar({
  selectedTool, selectedElement, setSelectedElement,
  nodes, links, catchments,
  updateNode, updateLink, updateCatchment,
  deleteNode, deleteLink, deleteCatchment,
  generateVoronoiCatchments
}: SidebarProps) {

  const setSelectedTool = usePipelineStore(state => state.setSelectedTool);
  const store = usePipelineStore();

  // Local state for active integrated inventory panel: null = closed
  const [activeTableTab, setActiveTableTab] = useState<'nodes' | 'links' | 'catchments' | null>(null);
  
  // Search query filter for the active table
  const [searchQuery, setSearchQuery] = useState('');

  // Auto topological numbering states
  const [topoNodePrefix, setTopoNodePrefix] = useState('YS_');
  const [topoOutfallPrefix, setTopoOutfallPrefix] = useState('YS_OF_');
  const [topoStartIndex, setTopoStartIndex] = useState(1);

  const handleDelete = () => {
    if (selectedElement) {
      if (selectedElement.type === 'node') deleteNode(selectedElement.id);
      if (selectedElement.type === 'link') deleteLink(selectedElement.id);
      if (selectedElement.type === 'catchment') deleteCatchment(selectedElement.id);
      setSelectedElement(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input field
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT') {
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'v':
          setSelectedTool('select');
          break;
        case 'n':
          setSelectedTool('add_manhole');
          break;
        case 'o':
          setSelectedTool('add_outfall');
          break;
        case 'p':
          setSelectedTool('add_pipe');
          break;
        case 's':
          setSelectedTool('add_catchment');
          break;
        case 'delete':
        case 'backspace':
          handleDelete();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedTool, selectedElement]);

  const handleZoomFit = () => {
    window.dispatchEvent(new CustomEvent('map-auto-fit-global'));
  };

  // Manual reordering of list elements
  const moveNodeElement = (nodeId: string, direction: 'up' | 'down') => {
    const index = nodes.findIndex(n => n.id === nodeId);
    if (index === -1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= nodes.length) return;

    const nextNodes = [...nodes];
    const temp = nextNodes[index];
    nextNodes[index] = nextNodes[targetIdx];
    nextNodes[targetIdx] = temp;

    store.pushHistory();
    store.setNodes(nextNodes);
    store.runSim();
  };

  const moveLinkElement = (linkId: string, direction: 'up' | 'down') => {
    const index = links.findIndex(l => l.id === linkId);
    if (index === -1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= links.length) return;

    const nextLinks = [...links];
    const temp = nextLinks[index];
    nextLinks[index] = nextLinks[targetIdx];
    nextLinks[targetIdx] = temp;

    store.pushHistory();
    store.setLinks(nextLinks);
    store.runSim();
  };

  const moveCatchmentElement = (catchmentId: string, direction: 'up' | 'down') => {
    const index = catchments.findIndex(c => c.id === catchmentId);
    if (index === -1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= catchments.length) return;

    const nextCatchments = [...catchments];
    const temp = nextCatchments[index];
    nextCatchments[index] = nextCatchments[targetIdx];
    nextCatchments[targetIdx] = temp;

    store.pushHistory();
    store.setCatchments(nextCatchments);
    store.runSim();
  };

  // Get filtered elements for the tables
  const filteredNodes = nodes.filter(n => {
    const term = searchQuery.toLowerCase();
    return n.name.toLowerCase().includes(term) || n.id.toLowerCase().includes(term);
  });

  const filteredLinks = links.filter(l => {
    const term = searchQuery.toLowerCase();
    const fromNode = nodes.find(n => n.id === l.fromNodeId)?.name || '';
    const toNode = nodes.find(n => n.id === l.toNodeId)?.name || '';
    return l.name.toLowerCase().includes(term) || l.id.toLowerCase().includes(term) || fromNode.toLowerCase().includes(term) || toNode.toLowerCase().includes(term);
  });

  const filteredCatchments = catchments.filter(c => {
    const term = searchQuery.toLowerCase();
    const outletNode = nodes.find(n => n.id === c.outletNodeId)?.name || '';
    return c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term) || outletNode.toLowerCase().includes(term);
  });

  const drawingTools: { id: ToolType; icon: any; label: string; shortcut?: string }[] = [
    { id: 'select', icon: Pointer, label: '选择', shortcut: 'V' },
    { id: 'add_manhole', icon: CircleDot, label: '绘制节点井', shortcut: 'N' },
    { id: 'add_outfall', icon: ArrowRightToLine, label: '绘制排放口', shortcut: 'O' },
    { id: 'add_pipe', icon: Minus, label: '绘制管线', shortcut: 'P' },
    { id: 'add_catchment', icon: Pentagon, label: '绘制汇水区', shortcut: 'S' },
  ];

  const tableToggles = [
    { id: 'nodes' as const, icon: Database, label: '节点井表', count: nodes.length, color: 'text-blue-600', activeBg: 'bg-blue-50 border border-blue-100 font-bold' },
    { id: 'links' as const, icon: GitCommitHorizontal, label: '管线表', count: links.length, color: 'text-indigo-600', activeBg: 'bg-indigo-50 border border-indigo-100 font-bold' },
    { id: 'catchments' as const, icon: Layers, label: '汇水区表', count: catchments.length, color: 'text-amber-600', activeBg: 'bg-amber-50 border border-amber-100 font-bold' },
  ];

  return (
    <div className="flex h-full z-[100] shrink-0 bg-white shadow-sm border-r border-slate-200 select-none">
      
      {/* 1. Left Vertical Slim Ribbon/Bar */}
      <div className="w-12 bg-white flex flex-col items-center py-3 shrink-0 gap-2 h-full border-r border-slate-100">
        
        {/* Drawing Tools */}
        {drawingTools.map(t => {
          const isActive = selectedTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setSelectedTool(t.id);
                // When entering drawing mode, keep selection visible but turn off tables if necessary
              }}
              title={`${t.label} (${t.shortcut})`}
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded transition-colors group cursor-pointer relative",
                isActive 
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200" 
                  : "text-slate-600 bg-transparent hover:bg-slate-50"
              )}
            >
              <t.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="transition-transform group-hover:scale-105" />
            </button>
          );
        })}

        <div className="w-8 h-[1px] bg-slate-200 my-1"></div>

        {/* Delete Control */}
        <button
          onClick={handleDelete}
          title="删除选中要素 (Del)"
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded transition-colors cursor-pointer",
            selectedElement 
              ? "text-red-500 hover:bg-red-50 border border-red-100"
              : "text-slate-300 pointer-events-none"
          )}
        >
          <Eraser size={20} strokeWidth={2} />
        </button>

        {/* Auto Zoom Control */}
        <button
          onClick={handleZoomFit}
          title="自动适应范围"
          className="w-10 h-10 flex items-center justify-center rounded text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Scan size={20} strokeWidth={2} />
        </button>

        <div className="w-8 h-[1px] bg-slate-250 my-1"></div>

        {/* Three Table Panel Toggles */}
        {tableToggles.map(cat => {
          const isCurrent = activeTableTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveTableTab(activeTableTab === cat.id ? null : cat.id);
                setSearchQuery('');
              }}
              title={cat.label}
              className={cn(
                "w-10 h-11 flex flex-col items-center justify-center rounded-lg transition-all duration-200 relative cursor-pointer",
                isCurrent ? cat.activeBg : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <cat.icon size={18} className={cn("transition-transform hover:scale-105", cat.color)} />
              <span className="text-[8px] font-bold leading-none mt-1 tracking-tighter shrink-0">{cat.label.slice(0, 3)}</span>
              {cat.count > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full scale-90 border border-white">
                  {cat.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Slide/Expand Integrated Drawer Panel */}
      <AnimatePresence>
        {activeTableTab && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 520, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[520px] bg-slate-50 flex flex-col h-full overflow-hidden border-r border-slate-200 shadow-md"
          >
            {/* Header / Meta bar inside Side Dashboard */}
            <div className="p-3 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                {activeTableTab === 'nodes' && <Database size={16} className="text-blue-400" />}
                {activeTableTab === 'links' && <GitCommitHorizontal size={16} className="text-indigo-400" />}
                {activeTableTab === 'catchments' && <Layers size={16} className="text-amber-400" />}
                <h3 className="font-bold text-sm tracking-wide">
                  {activeTableTab === 'nodes' && "节点井与排放口要素总表"}
                  {activeTableTab === 'links' && "雨水排水分管线数据清单"}
                  {activeTableTab === 'catchments' && "汇排水分区属性分配清单"}
                </h3>
                <span className="text-xs bg-slate-700 text-slate-300 font-bold px-2 py-0.5 rounded-full">
                  {activeTableTab === 'nodes' && nodes.length}
                  {activeTableTab === 'links' && links.length}
                  {activeTableTab === 'catchments' && catchments.length}
                </span>
              </div>
              <button 
                onClick={() => {
                  setActiveTableTab(null);
                  setSearchQuery('');
                }}
                className="hover:bg-slate-800 p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Reordering Controls & Automatic Topology Actions Panel */}
            <div className="p-3 bg-white border-b border-slate-200 shrink-0 space-y-3">
              <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Sparkles size={14} className="text-purple-500 animate-pulse" />
                  <span>智能要素排序 & 拓扑命名</span>
                </div>
                <div className="flex items-center gap-1">
                  {selectedElement && (
                    <div className="flex items-center gap-1 border-r border-slate-300 pr-1 mr-1">
                      <button
                        onClick={() => {
                          if (selectedElement.type === 'node') moveNodeElement(selectedElement.id, 'up');
                          if (selectedElement.type === 'link') moveLinkElement(selectedElement.id, 'up');
                          if (selectedElement.type === 'catchment') moveCatchmentElement(selectedElement.id, 'up');
                        }}
                        title="上移选中要素"
                        className="p-1 text-slate-600 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                      >
                        <ChevronUp size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => {
                          if (selectedElement.type === 'node') moveNodeElement(selectedElement.id, 'down');
                          if (selectedElement.type === 'link') moveLinkElement(selectedElement.id, 'down');
                          if (selectedElement.type === 'catchment') moveCatchmentElement(selectedElement.id, 'down');
                        }}
                        title="下移选中要素"
                        className="p-1 text-slate-600 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                      >
                        <ChevronDown size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                  {activeTableTab === 'catchments' && (
                    <button
                      onClick={() => generateVoronoiCatchments()}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold text-[11px] py-1 px-2.5 rounded shadow-sm flex items-center gap-1 border border-green-500 cursor-pointer"
                      title="根据现有检查井一键自动生成泰森多边形汇水区模板"
                    >
                      一键自动划分
                    </button>
                  )}
                </div>
              </div>

              {/* Topological Sort Inputs */}
              <div className="grid grid-cols-12 gap-2 text-xs items-center p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="col-span-12 font-semibold text-slate-600 text-[11px] mb-1">重构整个排水管网拓扑编号:</div>
                <div className="col-span-4 space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold block">检查井前缀</label>
                  <input 
                    type="text" 
                    value={topoNodePrefix}
                    onChange={e => setTopoNodePrefix(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold block">排放口前缀</label>
                  <input 
                    type="text" 
                    value={topoOutfallPrefix}
                    onChange={e => setTopoOutfallPrefix(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold block">起始序号</label>
                  <input 
                    type="number" 
                    value={topoStartIndex}
                    onChange={e => setTopoStartIndex(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
                <div className="col-span-12 mt-1.5">
                  <button
                    onClick={() => {
                      store.reorderNetworkTopology(topoNodePrefix, topoOutfallPrefix, topoStartIndex);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowUpDown size={13} />
                    <span>一键重构排水管网拓扑 (下游排出口终端定位算法)</span>
                  </button>
                </div>
              </div>

              {/* Real-time search query box */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="检索要素编号或名称..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
                />
              </div>
            </div>

            {/* 3. The Dynamic Inventory Table */}
            <div className="flex-1 overflow-auto bg-white">
              
              {/* Nodes Inventory Table */}
              {activeTableTab === 'nodes' && (
                <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                  <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 shadow-sm">
                    <tr className="border-b border-slate-200">
                      <th className="p-2 w-10 text-center border-r border-slate-200">#</th>
                      <th className="p-2 border-r border-slate-200">类型</th>
                      <th className="p-2 border-r border-slate-200">要素编号 / Name</th>
                      <th className="p-2 border-r border-slate-200 text-right">管底标高 (m)</th>
                      <th className="p-2 border-r border-slate-200 text-right">地面高程 (m)</th>
                      <th className="p-2 text-center">操作排序</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNodes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-xs text-slate-400">无符合检索要求的管网节点</td>
                      </tr>
                    ) : (
                      filteredNodes.map((n, idx) => {
                        const isSelected = selectedElement?.type === 'node' && selectedElement.id === n.id;
                        const mainIdx = nodes.findIndex(node => node.id === n.id);
                        return (
                          <tr 
                            key={n.id}
                            className={cn(
                              "hover:bg-blue-50/40 cursor-pointer transition-colors",
                              isSelected ? "bg-blue-50 font-semibold" : ""
                            )}
                            onClick={() => setSelectedElement({ type: 'node', id: n.id })}
                          >
                            <td className="p-2 text-center text-slate-400 border-r border-slate-100 font-mono text-[10px]">{idx + 1}</td>
                            <td className="p-2 border-r border-slate-100">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9.5px] font-extrabold tracking-tight",
                                n.type === 'manhole' ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                              )}>
                                {n.type === 'manhole' ? "检查井" : "排放口"}
                              </span>
                            </td>
                            <td className="p-2 border-r border-slate-100">
                              <input 
                                type="text"
                                value={n.name}
                                onChange={e => {
                                  e.stopPropagation();
                                  updateNode(n.id, { name: e.target.value });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-full bg-transparent border-none font-bold text-slate-800 focus:ring-1 focus:ring-blue-400 rounded px-1 h-7 text-xs"
                              />
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              <StatefulNumberInput 
                                value={n.elevation}
                                onChange={newInv => {
                                  const currentGrd = n.elevation + n.maxDepth;
                                  updateNode(n.id, { 
                                    elevation: newInv,
                                    maxDepth: Math.max(0.1, currentGrd - newInv)
                                  });
                                }}
                                className="w-full bg-transparent text-right font-semibold text-slate-700 text-xs"
                              />
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              <StatefulNumberInput 
                                value={n.elevation + n.maxDepth}
                                onChange={newGrd => {
                                  updateNode(n.id, { maxDepth: Math.max(0.1, newGrd - n.elevation) });
                                }}
                                className="w-full bg-transparent text-right font-semibold text-slate-700 text-xs"
                              />
                            </td>
                            <td className="p-1 shrink-0">
                              <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={mainIdx === 0}
                                  onClick={() => moveNodeElement(n.id, 'up')}
                                  title="在主列表内上移该节点"
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 disabled:opacity-20 transition-all cursor-pointer"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={mainIdx === nodes.length - 1}
                                  onClick={() => moveNodeElement(n.id, 'down')}
                                  title="在主列表内下移该节点"
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 disabled:opacity-20 transition-all cursor-pointer"
                                >
                                  <ChevronDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteNode(n.id);
                                    if (isSelected) setSelectedElement(null);
                                  }}
                                  title="彻底删除该节点及其关联管道"
                                  className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {/* Pipes Inventory Table */}
              {activeTableTab === 'links' && (
                <table className="w-full text-xs text-left border-collapse min-w-[1000px]">
                  <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 shadow-sm">
                    <tr className="border-b border-slate-200">
                      <th className="p-2 w-10 text-center border-r border-slate-200">#</th>
                      <th className="p-2 border-r border-slate-200">管线编号</th>
                      <th className="p-2 border-r border-slate-200">起点/终点井</th>
                      <th className="p-2 border-r border-slate-200">截面形式</th>
                      <th className="p-2 border-r border-slate-200 text-right">管径/宽度 (mm)</th>
                      <th className="p-2 border-r border-slate-200 text-right">高度 (mm)</th>
                      <th className="p-2 border-r border-slate-200 text-right">管长 (m)</th>
                      <th className="p-2 border-r border-slate-200 text-right">坡度 (‰)</th>
                      <th className="p-2 border-r border-slate-200">管渠材质</th>
                      <th className="p-2 border-r border-slate-200 text-center">粗糙度 n</th>
                      <th className="p-2 text-center">操作排序</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLinks.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center p-8 text-xs text-slate-400">无符合检索要求的管道要素</td>
                      </tr>
                    ) : (
                      filteredLinks.map((l, idx) => {
                        const isSelected = selectedElement?.type === 'link' && selectedElement.id === l.id;
                        const mainIdx = links.findIndex(link => link.id === l.id);
                        return (
                          <tr 
                            key={l.id}
                            className={cn(
                              "hover:bg-indigo-50/40 cursor-pointer transition-colors",
                              isSelected ? "bg-indigo-50 font-semibold" : ""
                            )}
                            onClick={() => setSelectedElement({ type: 'link', id: l.id })}
                          >
                            <td className="p-2 text-center text-slate-400 border-r border-slate-100 font-mono text-[10px]">{idx + 1}</td>
                            <td className="p-2 border-r border-slate-100 font-bold text-slate-800">
                              <input 
                                type="text"
                                value={l.name}
                                onChange={e => {
                                  e.stopPropagation();
                                  updateLink(l.id, { name: e.target.value });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-full bg-transparent border-none font-bold text-slate-800 focus:ring-1 focus:ring-indigo-400 rounded px-1 h-7 text-xs"
                              />
                            </td>
                            <td className="p-2 border-r border-slate-100">
                              <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                                <select 
                                  value={l.fromNodeId} 
                                  onChange={e => updateLink(l.id, { fromNodeId: e.target.value, source: e.target.value })}
                                  className="bg-slate-50 border border-slate-200 rounded text-[10.5px] py-0.5 px-1 outline-none text-slate-700"
                                >
                                  {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                                </select>
                                <select 
                                  value={l.toNodeId} 
                                  onChange={e => updateLink(l.id, { toNodeId: e.target.value, target: e.target.value })}
                                  className="bg-slate-50 border border-slate-200 rounded text-[10.5px] py-0.5 px-1 outline-none text-slate-700"
                                >
                                  {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                                </select>
                              </div>
                            </td>
                            <td className="p-2 border-r border-slate-100">
                              <select 
                                value={l.shape || 'circular'}
                                onChange={e => {
                                  updateLink(l.id, { shape: e.target.value as any });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="bg-slate-50 border border-slate-200 rounded text-[10.5px] py-0.5 px-1 outline-none text-slate-700 w-20 cursor-pointer"
                              >
                                <option value="circular">圆形</option>
                                <option value="rectangular">矩形</option>
                                <option value="egg">蛋形</option>
                              </select>
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              <input 
                                type="number"
                                step={50}
                                value={l.diameter}
                                onChange={e => {
                                  e.stopPropagation();
                                  const newVal = parseInt(e.target.value) || 350;
                                  updateLink(l.id, { diameter: newVal });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-16 bg-transparent text-right font-bold text-blue-600 focus:ring-1 focus:ring-indigo-400 rounded px-1 h-7 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              {l.shape === 'rectangular' ? (
                                <input 
                                  type="number"
                                  step={50}
                                  value={l.height || 0}
                                  onChange={e => {
                                    e.stopPropagation();
                                    const newVal = parseInt(e.target.value) || 350;
                                    updateLink(l.id, { height: newVal });
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  className="w-16 bg-transparent text-right font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-400 rounded px-1 h-7 text-xs font-mono"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-center block select-none">-</span>
                              )}
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              <input 
                                type="number"
                                step={1}
                                value={l.length}
                                onChange={e => {
                                  e.stopPropagation();
                                  const newVal = parseFloat(e.target.value) || 10;
                                  updateLink(l.id, { length: newVal });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-16 bg-transparent text-right font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-400 rounded px-1 h-7 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              <input 
                                type="number"
                                step="0.1"
                                value={parseFloat((l.slope * 1000).toFixed(2))}
                                onChange={e => {
                                  e.stopPropagation();
                                  const newSlopePermille = parseFloat(e.target.value) || 0;
                                  const fromNode = nodes.find(n => n.id === l.fromNodeId);
                                  const toNode = nodes.find(n => n.id === l.toNodeId);
                                  if (fromNode && toNode) {
                                    const newToElev = fromNode.elevation - (newSlopePermille / 1000) * l.length;
                                    updateNode(toNode.id, { 
                                      elevation: newToElev,
                                      bottomElevation: newToElev
                                    });
                                  }
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-16 bg-transparent text-right font-semibold text-indigo-600 focus:ring-1 focus:ring-indigo-400 rounded px-1 h-7 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2 border-r border-slate-100">
                              <select 
                                value={l.material || ''}
                                onChange={e => {
                                  const mat = PIPE_MATERIALS.find(m => m.name === e.target.value);
                                  if (mat) {
                                    updateLink(l.id, { 
                                      material: mat.name,
                                      roughness: mat.n
                                    });
                                  } else {
                                    updateLink(l.id, { material: e.target.value });
                                  }
                                }}
                                onClick={e => e.stopPropagation()}
                                className="bg-slate-50 border border-slate-200 rounded text-[10.5px] py-0.5 px-1 outline-none text-slate-700 w-32 max-w-[130px] truncate cursor-pointer"
                              >
                                <option value="">自定义</option>
                                {PIPE_MATERIALS.map(m => (
                                  <option key={m.name} value={m.name} title={m.name}>
                                    {m.name.split(' (')[0] || m.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 border-r border-slate-100 text-center">
                              <input 
                                type="number"
                                step="0.001"
                                value={l.roughness ?? 0.013}
                                onChange={e => {
                                  e.stopPropagation();
                                  const newVal = parseFloat(e.target.value) || 0.013;
                                  updateLink(l.id, { roughness: newVal });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-14 bg-transparent text-center font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-400 rounded px-1 h-7 text-xs font-mono"
                              />
                            </td>
                            <td className="p-1">
                              <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={mainIdx === 0}
                                  onClick={() => moveLinkElement(l.id, 'up')}
                                  title="在主列表内上移该管道"
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 disabled:opacity-20 transition-all cursor-pointer"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={mainIdx === links.length - 1}
                                  onClick={() => moveLinkElement(l.id, 'down')}
                                  title="在主列表内下移该管道"
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 disabled:opacity-20 transition-all cursor-pointer"
                                >
                                  <ChevronDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteLink(l.id);
                                    if (isSelected) setSelectedElement(null);
                                  }}
                                  title="彻底删除该管道"
                                  className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {/* Catchments Inventory Table */}
              {activeTableTab === 'catchments' && (
                <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                  <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 shadow-sm">
                    <tr className="border-b border-slate-200">
                      <th className="p-2 w-10 text-center border-r border-slate-200">#</th>
                      <th className="p-2 border-r border-slate-200">分区编号</th>
                      <th className="p-2 border-r border-slate-200 text-right">面积 (ha)</th>
                      <th className="p-2 border-r border-slate-200">地面性质与系数</th>
                      <th className="p-2 border-r border-slate-200">汇水节点 (outlet)</th>
                      <th className="p-2 text-center">操作排序</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCatchments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-xs text-slate-400">无符合检索要求的汇水区要素</td>
                      </tr>
                    ) : (
                      filteredCatchments.map((c, idx) => {
                        const isSelected = selectedElement?.type === 'catchment' && selectedElement.id === c.id;
                        const mainIdx = catchments.findIndex(catchment => catchment.id === c.id);
                        return (
                          <tr 
                            key={c.id}
                            className={cn(
                              "hover:bg-amber-50/40 cursor-pointer transition-colors",
                              isSelected ? "bg-amber-50 font-semibold" : ""
                            )}
                            onClick={() => setSelectedElement({ type: 'catchment', id: c.id })}
                          >
                            <td className="p-2 text-center text-slate-400 border-r border-slate-100 font-mono text-[10px]">{idx + 1}</td>
                            <td className="p-2 border-r border-slate-100">
                              <input 
                                type="text"
                                value={c.name}
                                onChange={e => {
                                  e.stopPropagation();
                                  updateCatchment(c.id, { name: e.target.value });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-full bg-transparent border-none font-bold text-slate-800 focus:ring-1 focus:ring-amber-400 rounded px-1 h-7 text-xs"
                              />
                            </td>
                            <td className="p-2 text-right border-r border-slate-100">
                              <input 
                                type="number"
                                step="0.05"
                                value={c.area}
                                onChange={e => {
                                  e.stopPropagation();
                                  const newVal = parseFloat(e.target.value) || 0.1;
                                  updateCatchment(c.id, { area: newVal });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-16 bg-transparent text-right font-bold text-amber-600 focus:ring-1 focus:ring-amber-400 rounded px-1 h-7 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2 border-r border-slate-100">
                              <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                                <select 
                                  value={c.surfaceType || ''}
                                  onChange={e => {
                                    const selectedType = SURFACE_TYPES.find(t => t.name === e.target.value);
                                    if (selectedType) {
                                      updateCatchment(c.id, { 
                                        surfaceType: selectedType.name,
                                        runoffCoefficient: selectedType.coefficient
                                      });
                                    } else {
                                      updateCatchment(c.id, { surfaceType: e.target.value });
                                    }
                                  }}
                                  className="bg-slate-50 border border-slate-200 rounded text-[10px] py-0.5 px-1 outline-none text-slate-700 max-w-[130px] truncate"
                                >
                                  <option value="">未指定</option>
                                  {SURFACE_TYPES.map(st => <option key={st.name} value={st.name} title={st.name}>{st.name}</option>)}
                                </select>
                                <span className="text-[10px] text-gray-500 font-mono pl-1">
                                  Ψ = {c.runoffCoefficient.toFixed(2)}
                                </span>
                              </div>
                            </td>
                            <td className="p-2 border-r border-slate-100">
                              <select 
                                value={c.outletNodeId || ''}
                                onChange={e => {
                                  updateCatchment(c.id, { outletNodeId: e.target.value, nodeCtx: e.target.value });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-full bg-slate-50 border border-slate-200 text-[10.5px] py-0.5 px-1 outline-none rounded text-slate-700 font-semibold"
                              >
                                <option value="">未指定</option>
                                {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                              </select>
                            </td>
                            <td className="p-1">
                              <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={mainIdx === 0}
                                  onClick={() => moveCatchmentElement(c.id, 'up')}
                                  title="在主列表内上移该分区"
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-amber-600 disabled:opacity-20 transition-all cursor-pointer"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={mainIdx === catchments.length - 1}
                                  onClick={() => moveCatchmentElement(c.id, 'down')}
                                  title="在主列表内下移该分区"
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-amber-600 disabled:opacity-20 transition-all cursor-pointer"
                                >
                                  <ChevronDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteCatchment(c.id);
                                    if (isSelected) setSelectedElement(null);
                                  }}
                                  title="彻底删除该汇水分区"
                                  className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Status indicators */}
            <div className="bg-slate-100 border-t border-slate-200 p-2 text-[10px] text-slate-500 font-mono text-center shrink-0">
              提示: 点击表行可在地图和右侧面板中联动高亮所选要素
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { ToolType, Node, Link, Catchment } from '../types';
import { MousePointer2, CircleDot, ArrowDownToLine, GitCommitHorizontal, Hexagon, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { PIPE_MATERIALS, SURFACE_TYPES } from '../constants';

// 定义 Sidebar 组件接收的属性 (Props)
interface SidebarProps {
  selectedTool: ToolType; // 当前选中的工具
  selectedElement: { type: 'node' | 'link' | 'catchment', id: string } | null; // 当前选中的元素
  setSelectedElement: (el: { type: 'node' | 'link' | 'catchment', id: string } | null) => void;
  nodes: Node[]; // 所有节点数据
  links: Link[]; // 所有管线数据
  catchments: Catchment[]; // 所有汇水区数据
  updateNode: (id: string, updates: Partial<Node>) => void; // 更新节点属性的函数
  updateLink: (id: string, updates: Partial<Link>) => void; // 更新管线属性的函数
  updateCatchment: (id: string, updates: Partial<Catchment>) => void; // 更新汇水区属性的函数
  deleteNode: (id: string) => void; // 删除节点的函数
  deleteLink: (id: string) => void; // 删除管线的函数
  deleteCatchment: (id: string) => void; // 删除汇水区的函数
  clearBackgroundFeatures: () => void; // 清空底图要素的函数
  backgroundFeaturesCount: number; // 底图要素的数量
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
  clearBackgroundFeatures, backgroundFeaturesCount,
  defaultInvertElevation, setDefaultInvertElevation,
  defaultGroundElevation, setDefaultGroundElevation,
  generateVoronoiCatchments,
}: SidebarProps) {

  // 如果当前选中的是添加节点工具，显示默认标高设置
  const showDefaultElevations = selectedTool === 'add_manhole' || selectedTool === 'add_outfall';

  // 获取与节点连接的管线编号
  const getConnectedPipes = (nodeId: string) => {
    return links
      .filter(l => l.fromNodeId === nodeId || l.toNodeId === nodeId)
      .map(l => l.name)
      .join(', ');
  };

  // elementProps 用于存储选中元素的属性编辑表单
  let elementProps = null;
  
  // 如果当前有选中的元素，则根据元素类型生成对应的属性编辑表单
  if (selectedElement) {
    if (selectedElement.type === 'node') {
      // 查找选中的节点
      const node = nodes.find(n => n.id === selectedElement.id);
      if (node) {
        elementProps = (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">Node Properties</h3>
            {/* 节点名称输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Name</label>
              <input type="text" value={node.name} onChange={e => updateNode(node.id, { name: e.target.value })} className="w-full text-sm border rounded px-2 py-1 mt-1" />
            </div>
            {/* 节点类型（只读） */}
            <div>
              <label className="block text-xs text-gray-500">Type</label>
              <div className="text-sm py-1 capitalize">{node.type}</div>
            </div>
            {/* 地面标高输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Ground Elevation (m)</label>
              <input 
                type="number" 
                step="0.01"
                value={(node.elevation + node.maxDepth)} 
                onChange={e => {
                  const newGrd = parseFloat(e.target.value) || 0;
                  updateNode(node.id, { maxDepth: Math.max(0, newGrd - node.elevation) });
                }}
                className="w-full text-sm border rounded px-2 py-1 mt-1 font-mono" 
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Invert Elevation (m)</label>
              <input 
                type="number" 
                step="0.01"
                value={node.elevation} 
                onChange={e => {
                  const newInv = parseFloat(e.target.value) || 0;
                  const currentGrd = node.elevation + node.maxDepth;
                  updateNode(node.id, { 
                    elevation: newInv,
                    maxDepth: Math.max(0, currentGrd - newInv)
                  });
                }} 
                className="w-full text-sm border rounded px-2 py-1 mt-1 font-mono" 
              />
            </div>
            {/* 井深（只读） */}
            <div>
              <label className="block text-xs text-gray-500">Depth (m)</label>
              <div className="text-sm py-1 font-mono bg-gray-50 px-2 rounded border border-gray-100 mt-1 text-gray-600">
                {node.maxDepth.toFixed(2)}
              </div>
            </div>
            {/* 删除节点按钮 */}
            <button onClick={() => deleteNode(node.id)} className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 rounded py-1.5 text-sm hover:bg-red-100 transition-colors mt-4">
              <Trash2 size={16} /> Delete Node
            </button>
          </div>
        );
      }
    } else if (selectedElement.type === 'link') {
      // 查找选中的管线
      const link = links.find(l => l.id === selectedElement.id);
      if (link) {
        // 获取管线的起点和终点节点，以便显示标高信息
        const fromNode = nodes.find(n => n.id === link.fromNodeId);
        const toNode = nodes.find(n => n.id === link.toNodeId);
        
        elementProps = (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">Pipe Properties</h3>
            {/* 管线名称输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Name</label>
              <input type="text" value={link.name} onChange={e => updateLink(link.id, { name: e.target.value })} className="w-full text-sm border rounded px-2 py-1 mt-1" />
            </div>
            {/* 管道形状下拉选择框 */}
            <div>
              <label className="block text-xs text-gray-500">Shape</label>
              <select value={link.shape || 'circular'} onChange={e => updateLink(link.id, { shape: e.target.value as any })} className="w-full text-sm border rounded px-2 py-1 mt-1">
                <option value="circular">Circular</option>
                <option value="rectangular">Rectangular</option>
                <option value="egg">Egg-shaped</option>
              </select>
            </div>
            {/* 管道长度（只读，由地图自动计算） */}
            <div>
              <label className="block text-xs text-gray-500">Length (m) - Auto-calculated</label>
              <div className="text-sm py-1 font-mono bg-gray-50 px-2 rounded border border-gray-100 mt-1">
                {link.length}
              </div>
            </div>
            {/* 管道直径/宽度输入框 */}
            <div>
              <label className="block text-xs text-gray-500">
                {link.shape === 'rectangular' ? 'Width (mm)' : 'Diameter (mm)'}
              </label>
              <input 
                type="number" 
                step="50"
                value={link.diameter} 
                onChange={e => updateLink(link.id, { diameter: parseFloat(e.target.value) || 0 })} 
                className="w-full text-sm border rounded px-2 py-1 mt-1 font-mono" 
              />
            </div>
            {/* 管道高度输入框（仅限矩形） */}
            {link.shape === 'rectangular' && (
              <div>
                <label className="block text-xs text-gray-500">Height (mm)</label>
                <input 
                  type="number" 
                  step="50"
                  value={link.height || 0} 
                  onChange={e => updateLink(link.id, { height: parseFloat(e.target.value) || 0 })} 
                  className="w-full text-sm border rounded px-2 py-1 mt-1 font-mono" 
                />
              </div>
            )}
            {/* 管道材料选择 */}
            <div>
              <label className="block text-xs text-gray-500">Material (GB50014-2021)</label>
              <select 
                value={link.material || PIPE_MATERIALS[0].name} 
                onChange={e => {
                  const mat = PIPE_MATERIALS.find(m => m.name === e.target.value);
                  if (mat) {
                    updateLink(link.id, { material: mat.name, roughness: mat.n });
                  }
                }} 
                className="w-full text-sm border rounded px-2 py-1 mt-1"
              >
                {PIPE_MATERIALS.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
            {/* 曼宁粗糙系数输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Roughness (n)</label>
              <input type="number" step="0.001" value={link.roughness} onChange={e => updateLink(link.id, { roughness: parseFloat(e.target.value) || 0 })} className="w-full text-sm border rounded px-2 py-1 mt-1 font-mono" />
            </div>
            {/* 管底标高（只读，来自节点） */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs text-gray-500">Start Inv (m)</label>
                <div className="text-xs py-1 font-mono bg-gray-50 px-2 rounded border border-gray-100 mt-1">
                  {fromNode ? fromNode.elevation.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500">End Inv (m)</label>
                <div className="text-xs py-1 font-mono bg-gray-50 px-2 rounded border border-gray-100 mt-1">
                  {toNode ? toNode.elevation.toFixed(2) : 'N/A'}
                </div>
              </div>
            </div>
            {/* 删除管线按钮 */}
            <button onClick={() => deleteLink(link.id)} className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 rounded py-1.5 text-sm hover:bg-red-100 transition-colors mt-4">
              <Trash2 size={16} /> Delete Pipe
            </button>
          </div>
        );
      }
    } else if (selectedElement.type === 'catchment') {
      // 查找选中的汇水区
      const catchment = catchments.find(c => c.id === selectedElement.id);
      if (catchment) {
        elementProps = (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">Catchment Properties</h3>
            {/* 汇水区名称输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Name</label>
              <input type="text" value={catchment.name} onChange={e => updateCatchment(catchment.id, { name: e.target.value })} className="w-full text-sm border rounded px-2 py-1 mt-1" />
            </div>
            {/* 地面种类输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Surface Type (地面种类)</label>
              <select 
                value={catchment.surfaceType || ''} 
                onChange={e => {
                  const selectedType = SURFACE_TYPES.find(t => t.name === e.target.value);
                  if (selectedType) {
                    updateCatchment(catchment.id, { 
                      surfaceType: selectedType.name,
                      runoffCoefficient: selectedType.coefficient
                    });
                  } else {
                    updateCatchment(catchment.id, { surfaceType: e.target.value });
                  }
                }} 
                className="w-full text-sm border rounded px-2 py-1 mt-1"
              >
                <option value="">未指定</option>
                {SURFACE_TYPES.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            {/* 汇水区面积输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Area (ha)</label>
              <input type="number" step="0.1" value={catchment.area} onChange={e => updateCatchment(catchment.id, { area: parseFloat(e.target.value) || 0 })} className="w-full text-sm border rounded px-2 py-1 mt-1" />
            </div>
            {/* 径流系数输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Runoff Coefficient</label>
              <input type="number" step="0.05" value={catchment.runoffCoefficient} onChange={e => updateCatchment(catchment.id, { runoffCoefficient: parseFloat(e.target.value) || 0 })} className="w-full text-sm border rounded px-2 py-1 mt-1" />
            </div>
            {/* 汇流时间输入框 */}
            <div>
              <label className="block text-xs text-gray-500">Ground Inlet Time (地面集水时间 min)</label>
              <input type="number" step="1" value={catchment.timeOfConcentration} onChange={e => updateCatchment(catchment.id, { timeOfConcentration: parseFloat(e.target.value) || 1 })} className="w-full text-sm border rounded px-2 py-1 mt-1" />
            </div>
            {/* 排放节点选择框 */}
            <div>
              <label className="block text-xs text-gray-500">Outlet Node ID</label>
              <select value={catchment.outletNodeId} onChange={e => updateCatchment(catchment.id, { outletNodeId: e.target.value })} className="w-full text-sm border rounded px-2 py-1 mt-1">
                <option value="">Select Node</option>
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            {/* 删除汇水区按钮 */}
            <button onClick={() => deleteCatchment(catchment.id)} className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 rounded py-1.5 text-sm hover:bg-red-100 transition-colors mt-4">
              <Trash2 size={16} /> Delete Catchment
            </button>
          </div>
        );
      }
    }
  }

  return (
    // 侧边栏主容器
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full shadow-sm z-10">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
          Properties
        </h2>
        {selectedElement && (
          <button 
            onClick={() => setSelectedElement(null)}
            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
      
      {/* 渲染属性编辑面板（如果有选中的元素） */}
      <div className="flex-1 overflow-y-auto p-4">
        {showDefaultElevations && !selectedElement && (
          <div className="space-y-4 mb-6 p-3 bg-blue-50 rounded border border-blue-100">
            <h3 className="font-semibold text-sm text-blue-800 uppercase tracking-wider">Default Node Settings</h3>
            <p className="text-[10px] text-blue-600">Set elevations for the next node you place.</p>
            <div>
              <label className="block text-xs text-gray-500">Default Ground Elevation (m)</label>
              <input 
                type="number" 
                value={defaultGroundElevation} 
                onChange={e => setDefaultGroundElevation(parseFloat(e.target.value) || 0)} 
                className="w-full text-sm border rounded px-2 py-1 mt-1 bg-white" 
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Default Invert Elevation (m)</label>
              <input 
                type="number" 
                value={defaultInvertElevation} 
                onChange={e => setDefaultInvertElevation(parseFloat(e.target.value) || 0)} 
                className="w-full text-sm border rounded px-2 py-1 mt-1 bg-white" 
              />
            </div>
            <div className="text-[10px] text-gray-500 italic">
              Depth: {(defaultGroundElevation - defaultInvertElevation).toFixed(2)} m
            </div>
          </div>
        )}

        {elementProps || (
          <div className="space-y-6">
            <div className="text-sm text-gray-400 text-center mt-6 italic">
              Select an element on the map to view and edit its properties.
            </div>

            {/* Voronoi layout section removed as requested */}
            
            {backgroundFeaturesCount > 0 && (
              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Background Layers</h3>
                <div className="bg-blue-50 p-3 rounded border border-blue-100 mb-3">
                  <p className="text-xs text-blue-700">
                    Currently displaying <strong>{backgroundFeaturesCount}</strong> background features.
                  </p>
                </div>
                <button 
                  onClick={clearBackgroundFeatures}
                  className="w-full flex items-center justify-center gap-2 bg-white text-gray-600 border border-gray-300 rounded py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  <Trash2 size={16} /> Clear Background
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

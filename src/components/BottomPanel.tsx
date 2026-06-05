import { useState, useRef } from 'react';
import { SimulationResult, Node, Link, Catchment } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { ChevronUp, ChevronDown, Activity, Table as TableIcon, GripHorizontal, FileText, Monitor } from 'lucide-react';
import Draggable from 'react-draggable';
import PipeProfileCanvas from './PipeProfileCanvas';
import SimulationDashboard from './SimulationDashboard';
import HydraulicSummaryChart from './HydraulicSummaryChart';
import { usePipelineStore } from '../store/usePipelineStore';

// 定义 BottomPanel 组件接收的属性 (Props)
interface BottomPanelProps {
  simulationResult: SimulationResult | null; // 模拟结果数据
  nodes: Node[]; // 节点数据（用于在表格中显示节点名称等信息）
  links: Link[]; // 管线数据（用于在表格中显示管线名称等信息）
  catchments: Catchment[]; // 汇水区数据
}

export default function BottomPanel({ simulationResult, nodes, links, catchments }: BottomPanelProps) {
  const nodeRef = useRef(null);
  const { selectedElement } = usePipelineStore();
  
  // 局部状态：控制底部面板是否展开
  const [expanded, setExpanded] = useState(false);
  // 局部状态：控制当前激活的选项卡
  const [activeTab, setActiveTab] = useState<'nodes' | 'links' | 'charts' | 'catchments' | 'profile' | 'twin' | 'hydraulics'>('hydraulics');

  // 如果没有模拟结果，则不渲染底部面板
  if (!simulationResult) return null;

  // Compute dimensions dynamically based on tab content complexity
  let widthClass = "w-[800px]";
  let heightClass = "h-[500px]";
  if (expanded) {
    if (activeTab === 'twin') {
      widthClass = "w-[1140px]";
      heightClass = "h-[640px]";
    } else if (activeTab === 'profile') {
      widthClass = "w-[960px]";
      heightClass = "h-[540px]";
    } else if (activeTab === 'hydraulics') {
      widthClass = "w-[1100px]";
      heightClass = "h-[520px]";
    } else {
      widthClass = "w-[850px]";
      heightClass = "h-[500px]";
    }
  }

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      {/* 底部面板的主容器 */}
      <div 
        ref={nodeRef}
        className={cn(
        "fixed bottom-4 right-84 bg-white border border-gray-200 shadow-2xl rounded-xl transition-[width,height] duration-300 z-[1000] flex flex-col overflow-hidden",
        expanded ? `${widthClass} ${heightClass}` : "w-64 h-12" // 根据展开状态动态调整尺寸
      )}>
        {/* 面板的头部（标题栏），点击可以切换展开/折叠状态 */}
        <div 
          className="h-12 flex items-center justify-between px-4 cursor-pointer bg-gray-50 hover:bg-gray-100 border-b border-gray-200 drag-handle"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 font-bold text-gray-800">
            <GripHorizontal size={16} className="text-gray-400 mr-1" />
            <Activity size={18} className="text-blue-600" />
            Simulation Results
          </div>
          
          {/* 右侧区域：选项卡按钮和展开/折叠图标 */}
          <div className="flex items-center gap-4">
            {/* 只有在面板展开时才显示选项卡按钮 */}
            {expanded && (
              <div className="flex gap-1 overflow-x-auto max-w-[550px] scrollbar-none" onClick={e => e.stopPropagation()}>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'twin' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('twin')}
                >
                  🌐 数字化双胞胎
                </button>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'profile' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('profile')}
                >
                  📐 纵断面设计
                </button>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'hydraulics' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('hydraulics')}
                >
                  📈 水力学合规 (GB)
                </button>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'charts' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('charts')}
                >
                  Charts
                </button>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'nodes' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('nodes')}
                >
                  Nodes
                </button>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'links' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('links')}
                >
                  Pipes
                </button>
                <button 
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap", activeTab === 'catchments' ? "bg-blue-600 text-white shadow-md font-semibold" : "text-gray-600 hover:bg-gray-200")}
                  onClick={() => setActiveTab('catchments')}
                >
                  Catchments
                </button>
              </div>
            )}
            <button className="p-1 rounded hover:bg-gray-200 text-gray-500">
              {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>
          </div>
        </div>

        {/* 当面板展开时，渲染具体的内容区域 */}
        {expanded && (
          <div className="flex-1 overflow-hidden p-4 bg-white flex flex-col">
            {/* ==================== 渲染 数字化双胞胎 选项卡 ==================== */}
            {activeTab === 'twin' && (
              <div className="flex-1 overflow-auto bg-slate-950 p-2.5 rounded-xl">
                <SimulationDashboard />
              </div>
            )}

            {/* ==================== 渲染 纵断面设计 选项卡 ==================== */}
            {activeTab === 'profile' && (
              <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-[300px]">
                {selectedElement?.type === 'link' ? (
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-1.5 px-1 bg-slate-50 border border-slate-100 rounded-lg p-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <span className="text-xs font-bold text-slate-700">
                        正在分析选中的管线：<span className="font-mono text-sky-650">{links.find(l => l.id === selectedElement.id)?.name}</span> 极其关联井室的高程图
                      </span>
                    </div>
                    <div className="flex-1 min-h-[320px] bg-slate-950 border border-slate-850 rounded-xl overflow-hidden shadow-inner relative flex items-center justify-center">
                      <PipeProfileCanvas activeLinkId={selectedElement.id} />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-250 rounded-xl text-slate-500">
                    <span className="text-3xl mb-3">📐</span>
                    <h4 className="text-sm font-bold text-slate-700 mb-1">未选择管线 (Pipe Link)</h4>
                    <p className="text-xs max-w-sm">请点击地图上的排水管网管线，或在 Pipes 表格选项卡中选中任意管段，系统即刻生成该管段的智能三维地表及管路纵断面高程拖拽分析仪。</p>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 渲染水力合规双轴图表选项卡 ==================== */}
            {activeTab === 'hydraulics' && (
              <div className="flex-1 overflow-auto">
                <HydraulicSummaryChart />
              </div>
            )}

            {/* ==================== 渲染图表选项卡 ==================== */}
            {activeTab === 'charts' && (
              <div className="h-full w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={simulationResult.timeSeries} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="time" label={{ value: 'Time (min)', position: 'insideBottomRight', offset: -10 }} tick={{fontSize: 10}} />
                    <YAxis label={{ value: 'Flow (m³/s)', angle: -90, position: 'insideLeft' }} tick={{fontSize: 10}} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="totalRunoff" name="Total Runoff" stroke="#3b82f6" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="totalOutfall" name="Outfall Flow" stroke="#10b981" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ==================== 渲染节点结果表格选项卡 ==================== */}
            {activeTab === 'nodes' && (
              <div className="h-full overflow-auto border border-gray-100 rounded-xl shadow-inner bg-gray-50/30">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-gray-500 uppercase bg-gray-50/80 backdrop-blur-sm sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 font-bold">节点名称</th>
                      <th className="px-4 py-3 font-bold">类型</th>
                      <th className="px-4 py-3 font-bold text-right">总汇水面积 (ha)</th>
                      <th className="px-4 py-3 font-bold text-right">降雨历时 t (min)</th>
                      <th className="px-4 py-3 font-bold text-right">水头 (m)</th>
                      <th className="px-4 py-3 font-bold text-right">水深 (m)</th>
                      <th className="px-4 py-3 font-bold text-center">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {nodes.map(n => {
                      const res = simulationResult.nodeResults[n.id];
                      return (
                        <tr key={n.id} className="bg-white hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-gray-700">{n.name}</td>
                          <td className="px-4 py-2.5 text-gray-500 capitalize">{n.type}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-blue-600 font-semibold">{res?.totalArea.toFixed(2) || '0.00'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-orange-600 font-bold">{res?.travelTime.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{res?.head.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{res?.depth.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {res?.flooded ? 
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold text-[10px]">FLOODED</span> : 
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium text-[10px]">NORMAL</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ==================== 渲染管线结果表格选项卡 ==================== */}
            {activeTab === 'links' && (
              <div className="h-full overflow-auto border border-gray-100 rounded-xl shadow-inner bg-gray-50/30">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-gray-500 uppercase bg-gray-50/80 backdrop-blur-sm sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 font-bold">管段名称</th>
                      <th className="px-4 py-3 font-bold text-right">长度 (m)</th>
                      <th className="px-4 py-3 font-bold text-right">流量 (m³/s)</th>
                      <th className="px-4 py-3 font-bold text-right">流速 (m/s)</th>
                      <th className="px-4 py-3 font-bold text-right">推荐管径 (mm)</th>
                      <th className="px-4 py-3 font-bold text-right">推荐流速 (m/s)</th>
                      <th className="px-4 py-3 font-bold text-right">预设管径 (mm)</th>
                      <th className="px-4 py-3 font-bold text-right">预设流量 (m³/s)</th>
                      <th className="px-4 py-3 font-bold text-right">降雨历时 t (min)</th>
                      <th className="px-4 py-3 font-bold text-right">坡度 (‰)</th>
                      <th className="px-4 py-3 font-bold text-right">汇流面积 (ha)</th>
                      <th className="px-4 py-3 font-bold text-center">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {links.map(l => {
                      const res = simulationResult.linkResults[l.id];
                      const flowArea = res && res.velocity > 0 ? res.flow / res.velocity : 0;
                      return (
                        <tr key={l.id} className="bg-white hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-gray-700">{l.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{l.length}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-blue-600 font-bold">{res?.flow.toFixed(3) || '-'}</td>
                          <td className={cn(
                            "px-4 py-2.5 text-right font-mono",
                            res && res.velocity > res.maxVelocityLimit ? "text-red-600 font-bold" : "text-gray-700"
                          )}>
                            {res?.velocity.toFixed(2) || '-'}
                            {res && res.velocity > res.maxVelocityLimit && (
                              <span className="block text-[8px] text-red-500 uppercase">Exceeds Limit</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            <span className={cn(
                              "px-2 py-1 rounded text-[10px] font-bold",
                              res && res.recommendedDiameter !== l.diameter ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                            )}>
                              {res?.recommendedDiameter || l.diameter}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-green-600 font-semibold">{res?.recommendedVelocity.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{l.diameter}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{res?.capacity.toFixed(3) || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-orange-600 font-bold">{res?.totalTravelTime.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{(res?.slope * 1000).toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{res?.contributingArea.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex flex-col gap-1 items-center">
                              {res?.surcharge && (
                                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold text-[10px]">SURCHARGED</span>
                              )}
                              {res && res.velocity > res.maxVelocityLimit && (
                                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold text-[10px]">VELOCITY HIGH</span>
                              )}
                              {!res?.surcharge && res && res.velocity <= res.maxVelocityLimit && (
                                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium text-[10px]">OK</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* ==================== 渲染汇水区列表选项卡 ==================== */}
            {activeTab === 'catchments' && (
              <div className="h-full overflow-auto border border-gray-100 rounded-xl shadow-inner bg-gray-50/30">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-gray-500 uppercase bg-gray-50/80 backdrop-blur-sm sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 font-bold">序号</th>
                      <th className="px-4 py-3 font-bold">编号</th>
                      <th className="px-4 py-3 font-bold text-right">汇流面积 (ha)</th>
                      <th className="px-4 py-3 font-bold">地面种类</th>
                      <th className="px-4 py-3 font-bold text-right">径流系数</th>
                      <th className="px-4 py-3 font-bold">汇流节点</th>
                      <th className="px-4 py-3 font-bold text-right">地面集水时间 (min)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {catchments.map((c, index) => {
                      const outletNode = nodes.find(n => n.id === c.outletNodeId);
                      return (
                        <tr key={c.id} className="bg-white hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-2.5 text-gray-500">{index + 1}</td>
                          <td className="px-4 py-2.5 font-semibold text-gray-700">{c.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-blue-600 font-semibold">{c.area.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-gray-500">{c.surfaceType || '未指定'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{c.runoffCoefficient.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-gray-700">{outletNode?.name || '未知'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-500">{c.timeOfConcentration}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Draggable>
  );
}

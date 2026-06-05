import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMapEvents, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Node, Link, Catchment, ToolType, SimulationResult, BackgroundFeature } from '../types';
import { calculatePolygonArea } from '../lib/utils';
import { usePipelineStore } from '../store/usePipelineStore';
import FloodOverlay from './FloodOverlay';

// 修复 Leaflet 默认图标在 React 中不显示的常见问题
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 自定义检查井 (Manhole) 的图标样式：蓝色圆形
// 增加图标容器大小以提高点击灵敏度，实际视觉效果保持不变
const manholeIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// 自定义排放口 (Outfall) 的图标样式：红色方形
const outfallIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: '<div class="w-5 h-5 bg-red-500 rounded-sm border-2 border-white shadow-md"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// 自定义选中状态的图标样式：黄色、带动画效果
const selectedIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: '<div class="w-5 h-5 bg-yellow-400 rounded-full border-2 border-black shadow-lg animate-pulse"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// 自定义汇水区边界顶点 (Vertex) 的图标样式：白色带绿边的小圆点
const vertexIcon = new L.DivIcon({
  className: 'bg-white border-2 border-green-500 rounded-full shadow-sm',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// 定义 MapArea 组件接收的属性 (Props)
interface MapAreaProps {
  nodes: Node[]; // 所有节点数据
  links: Link[]; // 所有管线数据
  catchments: Catchment[]; // 所有汇水区数据
  backgroundFeatures: BackgroundFeature[]; // 所有底图要素数据
  selectedTool: ToolType; // 当前选中的工具
  selectedElement: { type: 'node' | 'link' | 'catchment', id: string } | null; // 当前选中的元素
  drawingLinkFrom: string | null; // 正在绘制管线时的起点节点ID
  drawingCatchmentPoints: [number, number][]; // 正在绘制汇水区时的顶点坐标
  simulationResult: SimulationResult | null; // 模拟结果数据
  onMapClick: (lat: number, lng: number) => void; // 点击地图的回调函数
  onNodeClick: (id: string) => void; // 点击节点的回调函数
  onLinkClick: (id: string) => void; // 点击管线的回调函数
  onCatchmentClick: (id: string) => void; // 点击汇水区的回调函数
  updateNode: (id: string, updates: Partial<Node>) => void; // 更新节点属性的回调函数（用于拖拽）
  updateCatchment: (id: string, updates: Partial<Catchment>) => void; // 更新汇水区属性的回调函数（用于编辑边界）
  mapType?: 'tianditu_vec' | 'tianditu_img' | 'osm'; // 底图类型
}

/**
 * 辅助组件：用于捕获地图的点击事件并实现吸附功能
 */
function MapEvents({ onMapClick, nodes }: { onMapClick: (lat: number, lng: number) => void, nodes: Node[] }) {
  const map = useMapEvents({
    click(e) {
      // 吸附逻辑：查找点击位置附近一定像素范围内的节点
      const clickPoint = map.latLngToContainerPoint(e.latlng);
      let snappedLatLng = e.latlng;
      let minDistance = 20; // 吸附阈值（像素）

      nodes.forEach(node => {
        const nodePoint = map.latLngToContainerPoint([node.lat, node.lng]);
        const distance = clickPoint.distanceTo(nodePoint);
        if (distance < minDistance) {
          minDistance = distance;
          snappedLatLng = L.latLng(node.lat, node.lng);
        }
      });

      onMapClick(snappedLatLng.lat, snappedLatLng.lng);
    },
  });
  return null;
}

// 根据图层名称生成一个稳定的颜色
const getLayerColor = (layerName: string) => {
  if (!layerName) return '#94a3b8';
  let hash = 0;
  for (let i = 0; i < layerName.length; i++) {
    hash = layerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
};

/**
 * 辅助组件：用于捕获地图实例并传递给父组件
 */
function MapInstanceCapture({ setMap }: { setMap: (map: L.Map) => void }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (map) {
      setMap(map);
    }
  }, [map, setMap]);
  return null;
}

/**
 * 地图区域主组件
 * 负责渲染地图底图、节点、管线、汇水区，并处理相关的用户交互（点击、拖拽等）
 */
export default function MapArea({
  nodes, links, catchments, backgroundFeatures, selectedTool, selectedElement,
  drawingLinkFrom, drawingCatchmentPoints, simulationResult,
  onMapClick, onNodeClick, onLinkClick, onCatchmentClick,
  updateNode, updateCatchment, mapType = 'tianditu_vec'
}: MapAreaProps) {

  const boundaryPolygon = usePipelineStore(state => state.boundaryPolygon);
  const spatialAnchor = usePipelineStore(state => state.spatialAnchor);
  
  const waterDepth2D = usePipelineStore(state => state.waterDepth2D);
  const rows2D = usePipelineStore(state => state.rows2D);
  const cols2D = usePipelineStore(state => state.cols2D);
  const gridSize2D = usePipelineStore(state => state.gridSize2D);

  const computedAnchor = useMemo(() => {
    if (spatialAnchor) return spatialAnchor;
    if (nodes && nodes.length > 0) {
      return {
        lat: nodes.reduce((sum, n) => sum + n.lat, 0) / nodes.length,
        lng: nodes.reduce((sum, n) => sum + n.lng, 0) / nodes.length
      };
    }
    return null;
  }, [spatialAnchor, nodes]);

  // 局部状态：记录鼠标在屏幕上的位置（目前未使用，保留用于未来扩展）
  const [mousePos, setMousePos] = useState<[number, number] | null>(null);
  // 局部状态：记录当前正在拖拽的节点信息，用于实现拖拽时的实时预览
  const [draggingNode, setDraggingNode] = useState<{id: string, lat: number, lng: number} | null>(null);
  // 局部状态：记录当前正在拖拽的汇水区顶点信息
  const [draggingVertex, setDraggingVertex] = useState<{catchmentId: string, index: number, lat: number, lng: number} | null>(null);
  // 引用地图实例，用于程序化控制地图（如缩放至特定范围）
  const [map, setMap] = useState<L.Map | null>(null);

  // 监听自定义的 'map-auto-fit' 事件，实现导入数据后自动缩放
  useEffect(() => {
    const handleAutoFit = (e: any) => {
      if (!map) return;
      const features = e.detail?.features as BackgroundFeature[];
      if (!features || !Array.isArray(features) || features.length === 0) return;

      const bounds = L.latLngBounds([]);
      features.forEach(f => {
        if (f.type === 'point') {
          bounds.extend(f.coordinates as [number, number]);
        } else if (f.type === 'line') {
          (f.coordinates as [number, number][]).forEach(c => bounds.extend(c));
        }
      });

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      }
    };

    window.addEventListener('map-auto-fit', handleAutoFit);
    return () => window.removeEventListener('map-auto-fit', handleAutoFit);
  }, [map]);

  // 当片区导入边界或空间锚点变更时，地图自动缩放至要素范围
  useEffect(() => {
    if (map && boundaryPolygon && boundaryPolygon.length > 0) {
      const bounds = L.latLngBounds(boundaryPolygon);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  }, [map, boundaryPolygon]);

  // Center on selected elements
  useEffect(() => {
    if (!map || !selectedElement) return;
    const { type, id } = selectedElement;
    if (type === 'node') {
      const node = nodes.find(n => n.id === id);
      if (node) {
        map.setView([node.lat, node.lng], Math.max(map.getZoom(), 16));
      }
    } else if (type === 'link') {
      const link = links.find(l => l.id === id);
      if (link) {
        const fromNode = nodes.find(n => n.id === link.fromNodeId);
        const toNode = nodes.find(n => n.id === link.toNodeId);
        if (fromNode && toNode) {
          const lat = (fromNode.lat + toNode.lat) / 2;
          const lng = (fromNode.lng + toNode.lng) / 2;
          map.setView([lat, lng], Math.max(map.getZoom(), 16));
        }
      }
    } else if (type === 'catchment') {
      const catchment = catchments.find(c => c.id === id);
      if (catchment && catchment.polygon.length > 0) {
        const lat = catchment.polygon.reduce((sum, p) => sum + p[0], 0) / catchment.polygon.length;
        const lng = catchment.polygon.reduce((sum, p) => sum + p[1], 0) / catchment.polygon.length;
        map.setView([lat, lng], Math.max(map.getZoom(), 16));
      }
    }
  }, [selectedElement, map, nodes, links, catchments]);

  return (
    <div className="w-full h-full relative" onMouseMove={(e) => {
      // 在这里可以处理鼠标移动事件，例如用于绘制管线时的动态连线
      // 但由于没有直接获取地图实例，获取经纬度比较复杂，目前采用简化处理
    }}>
      {/* MapContainer 是 react-leaflet 的核心组件，初始化地图 */}
      <MapContainer 
        center={[22.5431, 114.0579]} // 初始中心点坐标（深圳）
        zoom={13} // 初始缩放级别
        style={{ height: '100%', width: '100%' }} // 占满父容器
        className="z-0" // 确保地图在最底层
        preferCanvas={true} // 启用 Canvas 渲染以提高大量矢量要素的性能
      >
        {/* 捕获地图实例 */}
        <MapInstanceCapture setMap={setMap} />
        
        {/* TileLayer 用于加载地图瓦片（底图） */}
        {mapType === 'osm' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
        )}

        {mapType === 'tianditu_vec' && (
          <>
            <TileLayer
              attribution='&copy; <a href="http://www.tianditu.gov.cn/">天地图</a>'
              url="https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=e97bd73ab261e619504c77adf4f61494"
              subdomains={['0', '1', '2', '3', '4', '5', '6', '7']}
            />
            <TileLayer
              url="https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=e97bd73ab261e619504c77adf4f61494"
              subdomains={['0', '1', '2', '3', '4', '5', '6', '7']}
            />
          </>
        )}

        {mapType === 'tianditu_img' && (
          <>
            <TileLayer
              attribution='&copy; <a href="http://www.tianditu.gov.cn/">天地图</a>'
              url="https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=e97bd73ab261e619504c77adf4f61494"
              subdomains={['0', '1', '2', '3', '4', '5', '6', '7']}
            />
            <TileLayer
              url="https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=e97bd73ab261e619504c77adf4f61494"
              subdomains={['0', '1', '2', '3', '4', '5', '6', '7']}
            />
          </>
        )}

        {/* 挂载地图事件监听器 */}
        <MapEvents onMapClick={onMapClick} nodes={nodes} />

        {/* ==================== 渲染 2D 积水地表漫流热力图层 ==================== */}
        <FloodOverlay
          waterDepthArray={waterDepth2D}
          rows={rows2D}
          cols={cols2D}
          gridSize={gridSize2D}
          anchor={computedAnchor}
        />

        {/* ==================== 渲染片区范围线与空间锚点 ==================== */}
        {boundaryPolygon && boundaryPolygon.length > 0 && (
          <Polygon
            positions={boundaryPolygon}
            pathOptions={{
              color: '#4f46e5', // 规划深紫罗兰
              fillColor: '#818cf8',
              fillOpacity: 0.12,
              weight: 3.5,
              dashArray: '10, 8'
            }}
          >
            <Tooltip sticky>
              <div className="bg-slate-900 border border-slate-800 text-slate-100 p-2.5 rounded shadow-xl text-xs leading-relaxed font-sans">
                <span className="font-bold text-indigo-400">片区雨水管网数字孪生范围线</span><br />
                <span className="text-slate-400">总投影节点: <span className="font-mono text-white text-[11px]">{boundaryPolygon.length}</span></span><br />
                <span className="text-slate-400">中心坐标系锚点: <span className="font-mono text-[11px] text-white font-bold">{spatialAnchor ? `${spatialAnchor.lat.toFixed(4)}, ${spatialAnchor.lng.toFixed(4)}` : '未计算'}</span></span>
              </div>
            </Tooltip>
          </Polygon>
        )}

        {spatialAnchor && (
          <Marker
            position={[spatialAnchor.lat, spatialAnchor.lng]}
            icon={new L.DivIcon({
              className: 'custom-div-icon',
              html: `
                <div class="relative flex items-center justify-center">
                  <div class="absolute w-8 h-8 bg-indigo-500 rounded-full animate-ping opacity-35"></div>
                  <div class="w-5 h-5 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center shadow-lg">
                    <div class="w-2.5 h-2.5 bg-yellow-300 rounded-full"></div>
                  </div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })}
          >
            <Tooltip permanent direction="top" className="bg-slate-900 text-white border-none p-1 rounded text-[10px] opacity-90">
              <span className="font-semibold font-mono">投影坐标原点 (0, 0)</span>
            </Tooltip>
          </Marker>
        )}

        {/* ==================== 渲染导入的底图要素 ==================== */}
        {backgroundFeatures && backgroundFeatures.length > 0 && backgroundFeatures.map(f => {
          try {
            if (!f || !f.coordinates) return null;

            const layerColor = getLayerColor(f.properties?.layer);

            if (f.type === 'line') {
              const positions = f.coordinates as [number, number][];
              if (!Array.isArray(positions) || positions.length < 2) return null;

              return (
                <Polyline 
                  key={f.id} 
                  positions={positions} 
                  pathOptions={{ 
                    color: layerColor, 
                    weight: 1.5, 
                    opacity: 0.5,
                    dashArray: f.properties?.dxfType === 'ARC' ? '2, 2' : undefined 
                  }} 
                  interactive={false} 
                />
              );
            } else if (f.type === 'point') {
              const position = f.coordinates as [number, number];
              if (!Array.isArray(position) || position.length !== 2) return null;

              // 如果是文字要素，显示文字
              if (f.properties?.text) {
                return (
                  <Marker 
                    key={f.id} 
                    position={position} 
                    icon={L.divIcon({
                      className: 'bg-transparent border-none shadow-none',
                      html: `<div style="color: ${layerColor}; font-size: 10px; white-space: nowrap; opacity: 0.7; pointer-events: none; font-family: sans-serif;">${f.properties.text}</div>`,
                      iconSize: [0, 0],
                      iconAnchor: [0, 0]
                    })}
                    interactive={false} 
                  />
                );
              }

              return (
                <Marker 
                  key={f.id} 
                  position={position} 
                  icon={L.divIcon({
                    className: 'rounded-full border border-white shadow-sm',
                    html: `<div style="background-color: ${layerColor}; width: 4px; height: 4px; border-radius: 50%; pointer-events: none;"></div>`,
                    iconSize: [4, 4],
                    iconAnchor: [2, 2]
                  })}
                  interactive={false} 
                />
              );
            }
          } catch (e) {
            // 吞掉单个要素的渲染错误，防止崩溃
          }
          return null;
        })}

        {/* ==================== 渲染汇水区 ==================== */}
        {catchments.map(c => {
          // 判断当前汇水区是否被选中
          const isSelected = selectedElement?.type === 'catchment' && selectedElement.id === c.id;
          // 查找该汇水区对应的排放节点
          const outletNode = nodes.find(n => n.id === c.outletNodeId);
          const outletName = outletNode ? outletNode.name : 'None';

          // 获取多边形的顶点坐标，如果当前正在拖拽某个顶点，则使用拖拽中的临时坐标
          const positions = c.polygon.map((pt, idx) => {
            if (draggingVertex?.catchmentId === c.id && draggingVertex?.index === idx) {
              return [draggingVertex.lat, draggingVertex.lng] as [number, number];
            }
            return pt;
          });

          // 计算多边形的中心点，用于放置标签
          let centerLat = 0;
          let centerLng = 0;
          if (positions.length > 0) {
            centerLat = positions.reduce((sum, p) => sum + p[0], 0) / positions.length;
            centerLng = positions.reduce((sum, p) => sum + p[1], 0) / positions.length;
          }

          return (
            <React.Fragment key={c.id}>
              {/* 渲染汇水区多边形 */}
              <Polygon
                positions={positions}
                pathOptions={{ 
                  color: isSelected ? '#eab308' : '#22c55e', // 选中时为黄色，否则为绿色
                  fillColor: '#22c55e', 
                  fillOpacity: 0.2,
                  weight: isSelected ? 3 : 1
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e); // 阻止事件冒泡到地图
                    onCatchmentClick(c.id); // 触发点击回调
                  }
                }}
              />
              
              {/* 在汇水区中心显示标签（面积和排放节点） */}
              {positions.length > 0 && (
                <Marker position={[centerLat, centerLng]} opacity={0} interactive={false}>
                  <Tooltip permanent direction="center" className="bg-transparent border-none shadow-none text-[10px] font-bold text-green-800 p-0 text-center whitespace-nowrap" interactive={false}>
                    <div style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff', lineHeight: '1.2' }}>
                      {isSelected && <><span className="text-xs bg-white/90 px-1 rounded border border-green-300 inline-block mb-0.5">{c.name}</span><br/></>}
                      Area: {c.area} ha<br/>
                      To: {outletName}
                    </div>
                  </Tooltip>
                </Marker>
              )}

              {/* 如果汇水区被选中，在每个顶点渲染一个可拖拽的标记，用于编辑边界 */}
              {isSelected && positions.map((pt, idx) => (
                <Marker
                  key={`${c.id}-v-${idx}`}
                  position={pt}
                  icon={vertexIcon}
                  draggable={true} // 允许拖拽
                  eventHandlers={{
                    dragstart: (e) => {
                      // 开始拖拽时，记录正在拖拽的顶点信息
                      setDraggingVertex({ catchmentId: c.id, index: idx, lat: pt[0], lng: pt[1] });
                    },
                    drag: (e) => {
                      // 拖拽过程中，实时更新顶点坐标以实现预览
                      const marker = e.target;
                      const position = marker.getLatLng();
                      setDraggingVertex({ catchmentId: c.id, index: idx, lat: position.lat, lng: position.lng });
                    },
                    dragend: (e) => {
                      // 拖拽结束时，清空拖拽状态，并将新坐标保存到 store 中
                      const marker = e.target;
                      const position = marker.getLatLng();
                      setDraggingVertex(null);
                      const newPolygon = [...c.polygon];
                      newPolygon[idx] = [position.lat, position.lng];
                      updateCatchment(c.id, { polygon: newPolygon });
                    }
                  }}
                />
              ))}
            </React.Fragment>
          );
        })}

        {/* ==================== 渲染正在绘制中的汇水区 ==================== */}
        {drawingCatchmentPoints.length > 0 && (
          <>
            <Polygon
              positions={drawingCatchmentPoints}
              pathOptions={{ color: '#22c55e', dashArray: '5, 5', fillOpacity: 0.1 }} // 虚线样式
            />
            {drawingCatchmentPoints.length >= 3 && (
              <Marker 
                position={[
                  drawingCatchmentPoints.reduce((sum, p) => sum + p[0], 0) / drawingCatchmentPoints.length,
                  drawingCatchmentPoints.reduce((sum, p) => sum + p[1], 0) / drawingCatchmentPoints.length
                ]} 
                opacity={0} 
                interactive={false}
              >
                <Tooltip permanent direction="center" className="bg-transparent border-none shadow-none text-[10px] font-bold text-green-800 p-0 text-center whitespace-nowrap" interactive={false}>
                  <div style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff' }}>
                    Drawing: {calculatePolygonArea(drawingCatchmentPoints)} ha
                  </div>
                </Tooltip>
              </Marker>
            )}
          </>
        )}

        {/* ==================== 渲染管线 ==================== */}
        {links.map(l => {
          // 查找管线的起点和终点节点
          const fromNode = nodes.find(n => n.id === l.fromNodeId);
          const toNode = nodes.find(n => n.id === l.toNodeId);
          if (!fromNode || !toNode) return null; // 如果找不到节点，则不渲染该管线

          // 如果某个节点正在被拖拽，则使用拖拽中的临时坐标，否则使用节点原本的坐标
          const fromLat = draggingNode?.id === fromNode.id ? draggingNode.lat : fromNode.lat;
          const fromLng = draggingNode?.id === fromNode.id ? draggingNode.lng : fromNode.lng;
          const toLat = draggingNode?.id === toNode.id ? draggingNode.lat : toNode.lat;
          const toLng = draggingNode?.id === toNode.id ? draggingNode.lng : toNode.lng;

          // 判断当前管线是否被选中
          const isSelected = selectedElement?.type === 'link' && selectedElement.id === l.id;
          // 获取该管线的模拟结果（如果有）
          const simRes = simulationResult?.linkResults[l.id];
          
          // 计算水位落差和坡度（千分比 ‰）
          const drop = fromNode.elevation - toNode.elevation;
          const slope = l.length > 0 ? (drop / l.length) * 1000 : 0; // per mille (‰)

          // 根据状态设置管线的颜色
          let color = '#64748b'; // 默认颜色：石板灰
          if (isSelected) color = '#eab308'; // 选中颜色：黄色
          else if (simRes) {
            if (simRes.surcharge) color = '#ef4444'; // 如果超载（满管），显示红色
            else if (simRes.flow > 0) color = '#3b82f6'; // 如果有水流，显示蓝色
          }

          // 计算箭头方向
          // 箭头方向：从井底标高大的点指向井底标高小的点
          const elevationDiff = fromNode.elevation - toNode.elevation;
          const isFlat = Math.abs(elevationDiff) < 0.001;
          
          // 如果起点标高大于等于终点标高，则方向为 from -> to (isForward = true)
          // 如果终点标高大于起点标高，则方向为 to -> from (isForward = false)
          const isForward = elevationDiff >= 0;
          
          const startPt = isForward ? [fromLat, fromLng] : [toLat, toLng];
          const endPt = isForward ? [toLat, toLng] : [fromLat, fromLng];
          
          // 计算角度
          const angle = Math.atan2(endPt[0] - startPt[0], endPt[1] - startPt[1]) * 180 / Math.PI;
          
          // CSS rotate(0deg) 默认指向正下方（由于 SVG path 的设计）
          // 地图坐标系中，正北是 90度，正东是 0度，正南是 -90度
          // 默认指向正南（-90度），所以旋转角度 = 270 - angle (或 -90 - angle)
          const cssRotation = 270 - angle; 

          return (
            <React.Fragment key={l.id}>
              {/* 渲染管线点击热区（透明、加宽），提高选择灵敏度 */}
              <Polyline
                positions={[[fromLat, fromLng], [toLat, toLng]]}
                pathOptions={{ 
                  color: 'transparent',
                  weight: 20, 
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onLinkClick(l.id);
                  }
                }}
              />
              
              {/* 渲染管线视觉层 */}
              <Polyline
                positions={[[fromLat, fromLng], [toLat, toLng]]}
                pathOptions={{ 
                  color, 
                  weight: isSelected ? 6 : Math.max(3, l.diameter / 200),
                  interactive: false 
                }}
              >
                <Tooltip>
                  {l.name} ({l.shape || 'circular'}, {l.shape === 'rectangular' ? 'W' : 'D'}{l.diameter})
                  <br/>Inv: {fromNode.elevation.toFixed(2)}m &rarr; {toNode.elevation.toFixed(2)}m
                  {simRes && `<br/>Flow: ${simRes.flow.toFixed(3)} m³/s`}
                </Tooltip>
              </Polyline>
              
              {/* 渲染流向箭头 - 增加 key 确保标高变化时强制更新，并添加过渡动画 */}
              {!isFlat && (
                <Marker 
                  key={`${l.id}-arrow-${fromNode.elevation}-${toNode.elevation}`}
                  position={[(fromLat + toLat) / 2, (fromLng + toLng) / 2]} 
                  icon={L.divIcon({
                    className: 'bg-transparent border-none shadow-none',
                    html: `<div style="transform: rotate(${cssRotation}deg); color: ${color}; display: flex; align-items: center; justify-content: center; opacity: 0.9; transition: transform 0.3s ease-in-out;">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                               <path d="M12 5v14M19 12l-7 7-7-7"/>
                             </svg>
                           </div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                  })}
                  interactive={false}
                />
              )}
              
              {/* 如果是平坡，显示一个提示点 */}
              {isFlat && (
                <Marker 
                  position={[(fromLat + toLat) / 2, (fromLng + toLng) / 2]} 
                  icon={L.divIcon({
                    className: 'bg-transparent border-none shadow-none',
                    html: `<div style="color: ${color}; display: flex; align-items: center; justify-content: center; opacity: 0.5;">
                             <div class="w-1.5 h-1.5 bg-current rounded-full"></div>
                           </div>`,
                    iconSize: [6, 6],
                    iconAnchor: [3, 3]
                  })}
                  interactive={false}
                />
              )}
              
              {/* 在管线中点渲染一个不可见的标记，用于挂载永久显示的标签 */}
              <Marker position={[(fromLat + toLat) / 2, (fromLng + toLng) / 2]} opacity={0} interactive={false}>
                <Tooltip permanent direction="center" className="bg-transparent border-none shadow-none text-[10px] font-bold text-blue-800 p-0 text-center whitespace-nowrap" interactive={false}>
                  <div style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff', lineHeight: '1.2' }}>
                    {/* 如果选中，额外显示名称和流量 */}
                    {isSelected && <><span className="text-xs bg-white/90 px-1 rounded border border-blue-300 inline-block mb-0.5">{l.name}{simRes ? ` | ${simRes.flow.toFixed(3)} m³/s` : ''}</span><br/></>}
                    {/* 始终显示长度、坡度和管径 */}
                    L={l.length}m, i={slope.toFixed(1)}‰<br/>
                    {l.shape === 'rectangular' ? `B×H=${l.diameter}×${l.height}` : `D=${l.diameter}`}
                  </div>
                </Tooltip>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* ==================== 渲染节点 (检查井/排放口) ==================== */}
        {nodes.map(n => {
          // 判断当前节点是否被选中
          const isSelected = selectedElement?.type === 'node' && selectedElement.id === n.id;
          // 获取该节点的模拟结果
          const simRes = simulationResult?.nodeResults[n.id];
          
          // 根据节点类型和状态选择图标
          let icon = n.type === 'outfall' ? outfallIcon : manholeIcon;
          if (isSelected) icon = selectedIcon; // 选中时的图标
          else if (simRes && simRes.flooded) {
            // 如果模拟结果显示溢流，使用红色弹跳图标
            icon = new L.DivIcon({
              className: 'bg-red-500 rounded-full border-2 border-white shadow-md animate-bounce',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
          }

          // 如果该节点正在被拖拽，使用临时坐标
          const lat = draggingNode?.id === n.id ? draggingNode.lat : n.lat;
          const lng = draggingNode?.id === n.id ? draggingNode.lng : n.lng;

          // 计算地面标高 (管底标高 + 最大深度)
          const groundElev = n.elevation + n.maxDepth;
          const invertElev = n.elevation;

          return (
            <Marker
              key={n.id}
              position={[lat, lng]}
              icon={icon}
              draggable={isSelected} // 只有选中的节点才能拖拽
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e); // 阻止事件冒泡
                  onNodeClick(n.id); // 触发点击回调
                },
                dragstart: (e) => {
                  // 开始拖拽时，记录当前节点的信息
                  setDraggingNode({ id: n.id, lat: n.lat, lng: n.lng });
                },
                drag: (e) => {
                  // 拖拽过程中，实时更新临时坐标，以便管线能跟着一起动
                  const marker = e.target;
                  const position = marker.getLatLng();
                  setDraggingNode({ id: n.id, lat: position.lat, lng: position.lng });
                },
                dragend: (e) => {
                  // 拖拽结束时，清空临时状态，并将新坐标保存到全局 store 中
                  const marker = e.target;
                  const position = marker.getLatLng();
                  setDraggingNode(null);
                  updateNode(n.id, { lat: position.lat, lng: position.lng });
                }
              }}
            >
              {/* 节点下方永久显示的标签（地面标高和管底标高） */}
              <Tooltip permanent direction="bottom" offset={[0, 10]} className="bg-transparent border-none shadow-none text-[10px] font-bold text-gray-800 p-0 text-center whitespace-nowrap" interactive={false}>
                <div style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff', lineHeight: '1.2' }}>
                  {/* 如果选中，额外显示节点名称 */}
                  {isSelected && <><span className="text-xs bg-white/90 px-1 rounded border border-gray-300 mb-0.5 inline-block">{n.name}</span><br/></>}
                  Gr: {groundElev.toFixed(2)}<br/>
                  Inv: {invertElev.toFixed(2)}
                  {/* 如果有模拟结果，额外显示当前水深 */}
                  {simRes && <><br/><span className="text-red-600">Depth: {simRes.depth.toFixed(2)}m</span></>}
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

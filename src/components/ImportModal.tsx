import React, { useState, useRef } from 'react';
import { X, Upload, AlertCircle } from 'lucide-react';
import proj4 from 'proj4'; // 用于坐标系转换的库
import DxfParser from 'dxf-parser'; // 用于解析DXF (CAD) 文件的库
import { v4 as uuidv4 } from 'uuid';
import { BackgroundFeature } from '../types';
import { usePipelineStore } from '../store/usePipelineStore';
import { importNodesFromGeoJson, importLinksFromGeoJson } from '../lib/GisDataImporter';

// 定义 ImportModal 组件接收的属性 (Props)
interface ImportModalProps {
  isOpen: boolean; // 控制弹窗是否显示
  onClose: () => void; // 关闭弹窗的回调函数
  onImport: (features: BackgroundFeature[]) => void; // 确认导入时的回调函数，将解析后的底图数据传给父组件
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
  // 局部状态：存储用户功能定向模式 (底图 underlay, 排水片区边界 boundary 还是 管网拓扑 pipeline)
  const [importMode, setImportMode] = useState<'underlay' | 'boundary' | 'pipeline'>('underlay');
  // 局部状态：存储用户选择的文件
  const [file, setFile] = useState<File | null>(null);
  // 局部状态：选择的坐标系类型（WGS84 经纬度 或 CGCS2000 投影坐标）
  const [coordSystem, setCoordSystem] = useState<'wgs84' | 'cgcs2000_proj'>('cgcs2000_proj');
  // 局部状态：中央子午线（用于 CGCS2000 投影坐标转换）
  const [centralMeridian, setCentralMeridian] = useState<string>('114');
  // 局部状态：坐标是否包含带号前缀
  const [zonePrefix, setZonePrefix] = useState<boolean>(false);
  // 局部状态：是否交换 X/Y 坐标（CAD 中常见的坐标轴定义差异）
  const [swapXY, setSwapXY] = useState<boolean>(false);
  // 局部状态：导入后是否自动缩放至要素范围
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  // 局部状态：存储错误信息
  const [error, setError] = useState<string | null>(null);
  // 局部状态：是否正在处理中
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  // 用于触发隐藏的文件输入框的引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 如果 isOpen 为 false，则不渲染任何内容
  if (!isOpen) return null;

  /**
   * 处理文件选择事件
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]); // 保存选中的文件
      setError(null); // 清除之前的错误信息
    }
  };

  /**
   * 处理导入按钮点击事件，解析文件并转换坐标
   */
  const handleImport = async () => {
    if (!file) {
      setError("Please select a file to import.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      // 读取文件内容为文本
      const text = await file.text();
      // 获取文件扩展名
      const extension = file.name.split('.').pop()?.toLowerCase();

      // Intercept and handle planning boundary importing directly
      if (importMode === 'boundary') {
        if (extension !== 'geojson' && extension !== 'json') {
          throw new Error("规划片区边界文件必须是标准的 .geojson 或 .json 多边形地理要素格式。");
        }
        let geojson;
        try {
          geojson = JSON.parse(text);
        } catch (e) {
          throw new Error("GeoJSON 文件 JSON 格式转换解析失败。请核对文件内容。");
        }
        const importGeoJSONBoundary = usePipelineStore.getState().importGeoJSONBoundary;
        const success = importGeoJSONBoundary(geojson);
        if (!success) {
          throw new Error("解析失败。上传的 GeoJSON 文件中未包含合法的闭合多边形（Polygon / MultiPolygon）要素！");
        }
        onClose();
        return;
      }

      // Intercept and handle pipeline topology network importing directly
      if (importMode === 'pipeline') {
        if (extension !== 'geojson' && extension !== 'json') {
          throw new Error("城市排水管网普查文件必须是标准的 WGS84 .geojson 或 .json 格式。");
        }
        let geojson;
        try {
          geojson = JSON.parse(text);
        } catch (e) {
          throw new Error("GeoJSON 文件格式错误或非合法的 JSON 数据。");
        }

        // Import Nodes first so that Link topological matching can reference them
        const importedNodes = importNodesFromGeoJson(geojson);
        const importedLinks = importLinksFromGeoJson(geojson);

        if (importedNodes.length === 0 && importedLinks.length === 0) {
          throw new Error("提取失败！GeoJSON 中没有发现任何合法的点特征 (Point/井标) 或线特征 (LineString/管段)。");
        }

        alert(`🎉 排水管网普查数据一键拓扑解析导入成功！\n\n• 成功导入/合并检查井 (Node): ${importedNodes.length} 个\n• 成功导入/重建管段 (Conduit): ${importedLinks.length} 段\n\n系统已经自动激活 0.2m 空间公差补齐，对缺失节点进行地表坡地及埋深容错自愈！`);
        
        // Auto-fit bounds if we have imported points
        if (importedNodes.length > 0) {
          setTimeout(() => {
            // Fake BackgroundFeatures for map-auto-fit
            const dummyBgFeatures = importedNodes.map(n => ({
              id: n.id,
              type: 'point' as const,
              coordinates: [n.lat, n.lng] as [number, number]
            }));
            window.dispatchEvent(new CustomEvent('map-auto-fit', { detail: { features: dummyBgFeatures } }));
          }, 150);
        }

        onClose();
        return;
      }

      let newFeatures: BackgroundFeature[] = [];

      // 定义坐标转换函数，默认不转换（直接返回原坐标）
      let transformCoords = (x: number, y: number): [number, number] => [x, y]; 

      // 如果用户选择了 CGCS2000 投影坐标系，则配置 proj4 进行转换
      if (coordSystem === 'cgcs2000_proj') {
        const cm = parseFloat(centralMeridian);
        if (isNaN(cm)) throw new Error("Invalid Central Meridian");
        
        // CGCS2000 使用 GRS80 椭球体
        // 根据是否包含带号前缀计算 false easting (东移常数)
        const falseEasting = zonePrefix ? `${Math.round(cm / 3)}500000` : '500000';
        // 构建 proj4 投影字符串 (高斯-克吕格投影)
        const projString = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=${falseEasting} +y_0=0 +ellps=GRS80 +units=m +no_defs`;
        
        // 定义转换函数：将投影坐标 (x, y) 转换为 WGS84 经纬度 (lat, lng)
        transformCoords = (x: number, y: number) => {
          try {
            // 根据是否交换 X/Y 进行调整。proj4 期望 [East, North]
            const east = swapXY ? y : x;
            const north = swapXY ? x : y;
            const [lng, lat] = proj4(projString, 'EPSG:4326', [east, north]);
            
            // 检查转换结果是否合理（经度在 -180 到 180 之间，纬度在 -90 到 90 之间）
            if (isNaN(lng) || isNaN(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
              return [0, 0];
            }
            return [lat, lng]; // Leaflet 使用 [lat, lng] 格式
          } catch (e) {
            console.error("Coord transform error:", e);
            return [0, 0];
          }
        };
      } else {
        // 如果输入已经是 WGS84 或 CGCS2000 经纬度
        transformCoords = (x: number, y: number) => {
          const lng = swapXY ? y : x;
          const lat = swapXY ? x : y;
          return [lat, lng];
        };
      }

      // ==================== 解析 DXF (CAD) 文件 ====================
      if (extension === 'dxf') {
        const parser = new DxfParser();
        const dxf = parser.parseSync(text); // 同步解析 DXF 文本
        
        if (!dxf || !dxf.entities) throw new Error("Invalid DXF file");

        // 遍历 DXF 文件中的所有实体
        dxf.entities.forEach((entity: any) => {
          const commonProps = { 
            layer: entity.layer, 
            color: entity.color,
            handle: entity.handle
          };

          // 1. 点要素 (POINT, CIRCLE 中心)
          if (entity.type === 'POINT' || entity.type === 'CIRCLE') {
            const x = entity.type === 'POINT' ? entity.x : entity.center.x;
            const y = entity.type === 'POINT' ? entity.y : entity.center.y;
            const [lat, lng] = transformCoords(x, y);
            newFeatures.push({
              id: uuidv4(),
              type: 'point',
              coordinates: [lat, lng],
              properties: { ...commonProps, dxfType: entity.type, radius: entity.radius }
            });
          } 
          // 2. 线要素 (LINE, POLYLINE, LWPOLYLINE)
          else if (entity.type === 'LINE' || entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
            let vertices = [];
            if (entity.type === 'LINE') {
              // DXF LINE 实体通常有 start 和 end 属性，而不是 vertices 数组
              if (entity.start && entity.end) {
                vertices = [entity.start, entity.end];
              } else if (entity.vertices && entity.vertices.length >= 2) {
                vertices = [entity.vertices[0], entity.vertices[1]];
              } else {
                return; // 跳过无效线段
              }
            } else {
              vertices = entity.vertices || [];
            }

            if (vertices.length < 2) return;

            const coords: [number, number][] = vertices.map((v: any) => {
              const [lat, lng] = transformCoords(v.x, v.y);
              return [lat, lng];
            });

            if (coords.length >= 2) {
              newFeatures.push({
                id: uuidv4(),
                type: 'line',
                coordinates: coords,
                properties: { ...commonProps, dxfType: entity.type }
              });
            }
          }
          // 3. 弧线 (ARC) - 离散化为线段
          else if (entity.type === 'ARC') {
            const center = entity.center;
            const radius = entity.radius;
            const startAngle = entity.startAngle;
            const endAngle = entity.endAngle;
            
            const points: [number, number][] = [];
            const steps = 20; // 离散化步数
            let angleStep = (endAngle - startAngle);
            if (angleStep < 0) angleStep += 2 * Math.PI;
            angleStep /= steps;

            for (let i = 0; i <= steps; i++) {
              const angle = startAngle + i * angleStep;
              const x = center.x + radius * Math.cos(angle);
              const y = center.y + radius * Math.sin(angle);
              const [lat, lng] = transformCoords(x, y);
              points.push([lat, lng]);
            }

            newFeatures.push({
              id: uuidv4(),
              type: 'line',
              coordinates: points,
              properties: { ...commonProps, dxfType: 'ARC' }
            });
          }
          // 4. 文字 (TEXT, MTEXT) - 作为点要素，带文字属性
          else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
            const x = entity.position?.x ?? entity.startPoint?.x ?? entity.column?.x ?? 0;
            const y = entity.position?.y ?? entity.startPoint?.y ?? entity.column?.y ?? 0;
            const [lat, lng] = transformCoords(x, y);
            newFeatures.push({
              id: uuidv4(),
              type: 'point',
              coordinates: [lat, lng],
              properties: { ...commonProps, dxfType: entity.type, text: entity.text }
            });
          }
        });

      // ==================== 解析 GeoJSON 文件 ====================
      } else if (extension === 'geojson' || extension === 'json') {
        const geojson = JSON.parse(text);
        const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);

        features.forEach((f: any) => {
          if (f.geometry.type === 'Point') {
            // 解析点要素为底图点
            const [lng, lat] = f.geometry.coordinates;
            const [tLat, tLng] = transformCoords(lng, lat); // GeoJSON 通常是 WGS84，但如果是投影坐标，这里会进行转换
            newFeatures.push({
              id: uuidv4(),
              type: 'point',
              coordinates: [tLat, tLng],
              properties: f.properties
            });
          } else if (f.geometry.type === 'LineString') {
            // 解析线要素为底图线
            const coords = f.geometry.coordinates;
            if (coords.length >= 2) {
               const transformedCoords: [number, number][] = coords.map((c: any) => {
                 const [tLat, tLng] = transformCoords(c[0], c[1]);
                 return [tLat, tLng];
               });
               newFeatures.push({
                 id: uuidv4(),
                 type: 'line',
                 coordinates: transformedCoords,
                 properties: f.properties
               });
            }
          }
        });
      } else {
        // 不支持的文件格式
        throw new Error("Unsupported file format. Please upload .dxf or .geojson");
      }

      // 过滤掉转换失败的无效坐标点 [0, 0] 或 NaN
      const validFeatures = newFeatures.filter(f => {
        if (!f || !f.coordinates) return false;
        if (f.type === 'point') {
          const coords = f.coordinates as [number, number];
          return !isNaN(coords[0]) && !isNaN(coords[1]) && (coords[0] !== 0 || coords[1] !== 0);
        } else if (f.type === 'line') {
          const coords = f.coordinates as [number, number][];
          return Array.isArray(coords) && coords.length >= 2 && coords.every(c => !isNaN(c[0]) && !isNaN(c[1]) && (c[0] !== 0 || c[1] !== 0));
        }
        return true;
      });

      if (validFeatures.length === 0 && newFeatures.length > 0) {
        throw new Error("All coordinates transformed to [0,0]. Please check your Central Meridian or Swap X/Y settings.");
      }

      // 调试日志：输出前几个转换后的坐标，方便在控制台查看
      console.log("Imported features:", validFeatures.length);
      if (validFeatures.length > 0) {
        console.log("First feature coords:", validFeatures[0].coordinates);
      }

      // 将解析并转换后的数据传递给父组件
      onImport(validFeatures);
      
      // 如果开启了自动中心，通知地图组件（这里通过简单的全局事件或延迟处理，实际项目中建议通过 store）
      if (autoCenter && validFeatures.length > 0) {
        // 简单的自动缩放逻辑：在下一帧触发地图更新
        setTimeout(() => {
          const mapElements = document.getElementsByClassName('leaflet-container');
          if (mapElements.length > 0) {
            // 触发一个自定义事件，MapArea 可以监听
            window.dispatchEvent(new CustomEvent('map-auto-fit', { detail: { features: validFeatures } }));
          }
        }, 100);
      }

      onClose(); // 关闭弹窗
    } catch (err: any) {
      // 捕获并显示错误信息
      setError(err.message || "Failed to parse file");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    // 弹窗背景遮罩
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      {/* 弹窗主体容器 */}
      <div className="bg-white rounded-lg shadow-xl w-[500px] max-w-[90vw] flex flex-col">
        {/* 弹窗头部：标题和关闭按钮 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Upload size={20} className="text-blue-600" />
            Import GIS / CAD Data
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 弹窗内容区域 */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {/* 导入模式定向选择器 Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setImportMode('underlay');
                setError(null);
              }}
              className={`py-2 px-1 text-[11px] font-semibold rounded-md transition-all ${
                importMode === 'underlay'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              🗺️ 矢量设计底图
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode('boundary');
                setError(null);
                setCoordSystem('wgs84'); // For boundaries we expect raw geometries
              }}
              className={`py-2 px-1 text-[11px] font-semibold rounded-md transition-all ${
                importMode === 'boundary'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              📐 片区范围锚定
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode('pipeline');
                setError(null);
                setCoordSystem('wgs84');
              }}
              className={`py-2 px-1 text-[11px] font-semibold rounded-md transition-all ${
                importMode === 'pipeline'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              💧 管网拓扑导入
            </button>
          </div>

          {/* 显示错误信息 */}
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200 flex items-start gap-2 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 文件选择输入框 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File (DXF, GeoJSON)</label>
            <input 
              type="file" 
              accept=".dxf,.geojson,.json"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-300 rounded"
            />
          </div>

          {/* 坐标系选择下拉框 */}
          {importMode === 'underlay' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coordinate System</label>
              <select 
                value={coordSystem} 
                onChange={(e) => setCoordSystem(e.target.value as any)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="cgcs2000_proj">CGCS2000 Projected (Gauss-Kruger)</option>
                <option value="wgs84">WGS84 / CGCS2000 Geographic (Lat/Lng)</option>
              </select>
            </div>
          )}

          {/* 如果选择了投影坐标系，则显示额外的配置选项 */}
          {importMode === 'underlay' && coordSystem === 'cgcs2000_proj' && (
            <div className="bg-gray-50 p-4 rounded border border-gray-200 space-y-3">
              {/* 中央子午线输入框 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Central Meridian (Longitude)</label>
                <input 
                  type="number" 
                  value={centralMeridian} 
                  onChange={(e) => setCentralMeridian(e.target.value)}
                  placeholder="e.g., 114"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              {/* 是否包含带号前缀的复选框 */}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="checkbox" 
                  checked={zonePrefix} 
                  onChange={(e) => setZonePrefix(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                X coordinates include zone number prefix (e.g., 38500000)
              </label>
              {/* 交换 X/Y 坐标的复选框 */}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="checkbox" 
                  checked={swapXY} 
                  onChange={(e) => setSwapXY(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Swap X/Y coordinates (CAD X=North, Y=East)
              </label>
              {/* 自动缩放的复选框 */}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="checkbox" 
                  checked={autoCenter} 
                  onChange={(e) => setAutoCenter(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Auto-center map on imported data
              </label>
            </div>
          )}
          
          {/* 导入说明提示框 */}
          <div className="text-xs text-gray-500 bg-slate-50 p-3 rounded.md border border-slate-200">
            <p className="font-semibold text-slate-700 mb-1.5">💡 导入说明与指南 (Import Guide):</p>
            {importMode === 'underlay' ? (
              <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                <li>CAD (DXF): 常规管线图层和检查点作为不参与水力拓扑运算的地理底图背景导入显示。</li>
                <li>GIS (GeoJSON): 点和折线要素被渲染到底图。WGS 84 及投影坐标均可。</li>
                <li>通过开启 Swap X/Y，可以有效修正一些传统 CAD 软件导致的测绘横纵向颠倒问题。</li>
              </ul>
            ) : importMode === 'boundary' ? (
              <ul className="list-disc pl-4 space-y-1.5 leading-relaxed text-indigo-950">
                <li>本模式用于定义<strong>核心给排水规划片区范围线</strong>，必须导入包含封闭多边形的首选 GeoJSON 文件。</li>
                <li>导入时，系统将通过拓扑算法计算其地理坐标质心，并作为**高精度空间投影锚定点** [X_anchor, Y_anchor]。</li>
                <li>在此规划范围内，所有管线节点的距离、排水坡降与管阀截面积换算将获得**真实物理长度和流动势能校验**！</li>
              </ul>
            ) : (
              <ul className="list-disc pl-4 space-y-1.5 leading-relaxed text-cyan-950">
                <li>自动适配规划师常用的城市管网普查数据，将 Point 检查井和 LineString 管道一键转为可模拟的排水组件。</li>
                <li>系统将使用高精度距离算法，在 <strong>0.2 米空间公差</strong> 内自动建立检查井与管道的起终拓扑联系（Topological matching）。</li>
                <li>若管道的首尾端点缺少检查井，系统将自动自愈补齐相应检查井，并推算其基础深度，避免管网节点破损挂空。</li>
                <li>若普查数据中缺失管道长度，会自动通过 <strong>@turf/length</strong> 沿空间地理曲率重新测算最精确的实际物理长度（米）。</li>
              </ul>
            )}
          </div>
        </div>

        {/* 弹窗底部：操作按钮 */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          {/* 取消按钮 */}
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {/* 确认导入按钮 */}
          <button 
            onClick={handleImport}
            disabled={!file || isProcessing} // 如果没有选择文件或正在处理，则禁用按钮
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              'Import Data'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

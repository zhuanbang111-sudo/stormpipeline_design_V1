// 定义节点类型：'manhole'表示检查井，'outfall'表示排放口
export type NodeType = 'manhole' | 'outfall';

// 定义节点（Node）的数据结构接口
export interface Node {
  id: string; // 节点的唯一标识符（通常是UUID）
  type: NodeType; // 节点类型（检查井或排放口）
  lat: number; // 纬度（用于在地图上定位）
  lng: number; // 经度（用于在地图上定位）
  elevation: number; // 管底标高（Invert elevation），即管道底部的海拔高度，单位通常为米
  maxDepth: number; // 最大深度，即从地面到管底的深度，单位为米
  name: string; // 节点的名称，例如 "MH-1"
  bottomElevation?: number; // 基底或检查井底标高
  
  // 排放口特定属性 Outfall Specific Properties
  outfallType?: 'FREE' | 'NORMAL' | 'FIXED' | 'TIDAL'; // 排放口边界类型
  fixedStage?: number; // 固定潮位/水位 (m)
  tideGate?: boolean; // 逆止阀/防潮闸面
  tidalCurve?: string; // 关联潮位变化时序或曲线
}

// 定义管道形状：'circular'圆形，'rectangular'矩形，'egg'蛋形
export type PipeShape = 'circular' | 'rectangular' | 'egg';

// 定义管线（Link/Pipe）的数据结构接口
export interface Link {
  id: string; // 管线的唯一标识符
  fromNodeId: string; // 起点节点的ID
  toNodeId: string; // 终点节点的ID
  source?: string; // GIS来源节点ID外键属性
  target?: string; // GIS目标节点ID外键属性
  length: number; // 管道长度，单位为米（m）
  diameter: number; // 管道直径（如果是矩形则是宽度），单位为毫米（mm）
  height?: number; // 管道高度（仅用于矩形管道），单位为毫米（mm）
  shape: PipeShape; // 管道的截面形状
  material?: string; // 管道材料名称
  roughness: number; // 曼宁粗糙系数（Manning's n），用于计算水流阻力
  name: string; // 管道名称，例如 "P-1"
}

// 定义汇水区（Catchment）的数据结构接口
export interface Catchment {
  id: string; // 汇水区的唯一标识符
  name: string; // 汇水区名称
  area: number; // 汇水面积，单位为公顷（hectares）
  runoffCoefficient: number; // 径流系数（0到1之间），表示降雨转化为地表径流的比例
  surfaceType?: string; // 地面种类
  timeOfConcentration: number; // 汇流时间，即雨水从最远点流到出口所需的时间，单位为分钟
  outletNodeId: string; // 汇水区雨水排入的节点（通常是检查井）的ID
  polygon: [number, number][]; // 汇水区边界的多边形顶点坐标数组，每个元素是一个[纬度, 经度]的数组
}

// 定义模拟结果（SimulationResult）的数据结构接口
export interface SimulationResult {
  // 节点模拟结果：键是节点ID，值是包含水头(head)、水深(depth)和是否溢流(flooded)的对象
  nodeResults: Record<string, { 
    head: number; 
    depth: number; 
    flooded: boolean;
    directArea: number;
    totalArea: number;
    travelTime: number; // 降雨历时 t (min)
  }>;
  // 管线模拟结果：键是管线ID，值是包含流量(flow)、流速(velocity)、最大过流能力(capacity)和是否满管(surcharge)的对象
  linkResults: Record<string, { 
    flow: number; 
    velocity: number; 
    capacity: number; 
    surcharge: boolean;
    travelTime: number; // 管内流行时间 t2 (min)
    totalTravelTime: number; // 累计降雨历时 t (min)
    slope: number;
    contributingArea: number;
    maxVelocityLimit: number; // 最大允许流速 (m/s)
    recommendedDiameter: number; // 推荐管径 (mm)
    recommendedVelocity: number; // 推荐管径下的流速 (m/s)
  }>;
  // 时间序列数据：用于绘制图表，包含时间(time)、总径流(totalRunoff)和总排放量(totalOutfall)
  timeSeries: { time: number; totalRunoff: number; totalOutfall: number }[];
}

// 定义底图要素（BackgroundFeature）的数据结构接口，用于导入的CAD/GIS底图
export interface BackgroundFeature {
  id: string; // 要素的唯一标识符
  type: 'point' | 'line' | 'polygon'; // 要素类型
  coordinates: [number, number][] | [number, number]; // 坐标数据，[纬度, 经度]
  properties?: Record<string, any>; // 附加属性
}

// 定义当前选中的工具类型：选择、添加检查井、添加排放口、添加管道、添加汇水区
export type ToolType = 'select' | 'add_manhole' | 'add_outfall' | 'add_pipe' | 'add_catchment';


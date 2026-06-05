import { Node, Link } from '../types';

/**
 * 🌊 Flood2DEngine: 高性能一二维耦合 (1D/2D Coupling) 地表漫流与内涝模拟仿真引擎.
 * 系统使用扁平化的 Float32Array 数组结构避免高维嵌套对象的垃圾回收 (GC) 卡顿，
 * 为数字孪生、管网排涝方案评估提供极其强悍的边缘流体多轴动力学运算性能。
 */
export class Flood2DEngine {
  public rows: number;
  public cols: number;
  public gridSize: number; // 栅格尺寸 (米，例如 12.5m)
  
  // 密集类型化数据：地质高程、积水深标、轴向流速矢量
  public demArray: Float32Array;
  public waterDepthArray: Float32Array;
  public velocityX: Float32Array; // 沿X轴(东西向)溢流速矢量 (m/s)
  public velocityY: Float32Array; // 沿Y轴(南北向)溢流速矢量 (m/s)

  // 1D/2D 空间焊死耦合查找表 (Node ID -> surrounding 3x3 array of grid indexes)
  public couplingLookup: Map<string, number[]> = new Map();

  /**
   * 构造函数：初始化一维扁平高程与深度空间
   */
  constructor(rows: number, cols: number, dem: number[] | Float32Array, gridSize: number = 12.5) {
    this.rows = rows;
    this.cols = cols;
    this.gridSize = gridSize;

    const size = rows * cols;
    
    // 初始化密集类型化内存，加速存取
    this.demArray = new Float32Array(dem);
    this.waterDepthArray = new Float32Array(size);
    this.velocityX = new Float32Array(size);
    this.velocityY = new Float32Array(size);
  }

  /**
   * 重置模拟状态，清空地表积水及速度
   */
  public reset(): void {
    this.waterDepthArray.fill(0);
    this.velocityX.fill(0);
    this.velocityY.fill(0);
  }

  /**
   * 🗺️ 投影坐标转换: 将网格索性坐标对 (r, c) 转换为以空间锚点为中心 (0, 0) 的直角直角投影坐标系 meters
   */
  public gridToCartesian(r: number, c: number): { x: number; y: number } {
    const x = (c - this.cols / 2 + 0.5) * this.gridSize;
    const y = (this.rows / 2 - r - 0.5) * this.gridSize;
    return { x, y };
  }

  /**
   * 🗺️ 投影坐标转换: 将直角直角投影坐标 (x, y) 米转换回网格整数索引对 (r, c)
   */
  public cartesianToGrid(x: number, y: number): { r: number; c: number } {
    const c = Math.floor(x / this.gridSize + this.cols / 2);
    const r = Math.floor(this.rows / 2 - y / this.gridSize);
    return { r, c };
  }

  /**
   * 🗺️ 投影坐标转换: 将网格索引坐标对 (r, c) 转换成真实的 WGS84 地理经纬度 (lat, lng)
   */
  public gridToLatLng(r: number, c: number, anchor: { lat: number; lng: number }): { lat: number; lng: number } {
    const { x, y } = this.gridToCartesian(r, c);
    const lat = anchor.lat + y / 111320;
    const lng = anchor.lng + x / (111320 * Math.cos(anchor.lat * Math.PI / 180));
    return { lat, lng };
  }

  /**
   * 🗺️ 投影坐标转换: 将 WGS84 地理经纬度 (lat, lng) 转换成网格索引坐标对 (r, c)
   */
  public latLngToGrid(lat: number, lng: number, anchor: { lat: number; lng: number }): { r: number; c: number } {
    const dy = (lat - anchor.lat) * 111320;
    const dx = (lng - anchor.lng) * 111320 * Math.cos(anchor.lat * Math.PI / 180);
    return this.cartesianToGrid(dx, dy);
  }

  /**
   * 🛠️ 微地形自适应修正功能 (optimizeTerrain)
   * 1. 道路开挖 (Road Burning)：将管道10米内的栅格高度强降 0.15 米，构建水力学引水沟槽。
   * 2. 建筑阻水 (Building Blockage)：若栅格落入多边形高频建筑物掩膜内，高程强升 20.0 米，变为隔离堰。
   */
  public optimizeTerrain(
    links: Link[],
    nodes: Node[],
    anchor: { lat: number; lng: number },
    buildingsGeoJSON?: any
  ): void {
    // 预计算检查井的局部网格 Cartesian 直角物理坐标，极大优化段匹配流计算性能
    const nodeCartesian = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => {
      const dy = (n.lat - anchor.lat) * 111320;
      const dx = (n.lng - anchor.lng) * 111320 * Math.cos(anchor.lat * Math.PI / 180);
      nodeCartesian.set(n.id, { x: dx, y: dy });
    });

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        const cellPos = this.gridToCartesian(r, c);

        // --- 1. Road Burning (道路顺槽模拟) ---
        let isBurned = false;
        for (const l of links) {
          const fromPt = nodeCartesian.get(l.fromNodeId);
          const toPt = nodeCartesian.get(l.toNodeId);
          if (!fromPt || !toPt) continue;

          // 距离线段的垂直距离推导
          const dx = toPt.x - fromPt.x;
          const dy = toPt.y - fromPt.y;
          const L2 = dx * dx + dy * dy;
          let distSq = 0;

          if (L2 === 0) {
            distSq = (cellPos.x - fromPt.x) ** 2 + (cellPos.y - fromPt.y) ** 2;
          } else {
            let t = ((cellPos.x - fromPt.x) * dx + (cellPos.y - fromPt.y) * dy) / L2;
            t = Math.max(0, Math.min(1, t));
            const projX = fromPt.x + t * dx;
            const projY = fromPt.y + t * dy;
            distSq = (cellPos.x - projX) ** 2 + (cellPos.y - projY) ** 2;
          }

          if (distSq < 100) { // 空间距离小于10米 (10^2 = 100)
            isBurned = true;
            break;
          }
        }

        if (isBurned) {
          this.demArray[idx] -= 0.15; // 地形切斜燃烧，强化边缘漫流
        }

        // --- 2. Building Blockage (建筑物绝壁模拟) ---
        if (buildingsGeoJSON && buildingsGeoJSON.features) {
          const latLng = this.gridToLatLng(r, c, anchor);
          let insideBuilding = false;

          for (const feature of buildingsGeoJSON.features) {
            if (!feature.geometry) continue;
            
            // 处理单 Polygon 与 MultiPolygon 的掩膜边界
            if (feature.geometry.type === 'Polygon') {
              const coords = feature.geometry.coordinates;
              if (coords && coords[0]) {
                if (this.isPointInPolygon([latLng.lng, latLng.lat], coords[0])) {
                  insideBuilding = true;
                  break;
                }
              }
            } else if (feature.geometry.type === 'MultiPolygon') {
              const multiCoords = feature.geometry.coordinates;
              if (multiCoords) {
                for (const poly of multiCoords) {
                  if (poly && poly[0]) {
                    if (this.isPointInPolygon([latLng.lng, latLng.lat], poly[0])) {
                      insideBuilding = true;
                      break;
                    }
                  }
                }
              }
            }
          }

          if (insideBuilding) {
            this.demArray[idx] += 20.0; // 建筑高程充盈绝缘墙体，排斥漫流渗蓄
          }
        }
      }
    }
  }

  /**
   * 空间几何射线法推导 (Ray-casting Algorithm)：验证 WGS84 投影中心是否处于建筑物多边形内
   */
  private isPointInPolygon(point: [number, number], vs: number[][]): boolean {
    const x = point[0];
    const y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0];
      const yi = vs[i][1];
      const xj = vs[j][0];
      const yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * 🔗 一二维空间焊死与虚拟雨水口网格簇映射 (buildCouplingLookupTable)
   * 生成一维检查井至其 3x3 缓冲区网格簇的索引映射。通过分布式权重平分溢流量，消除尺度带来的数值发散。
   */
  public buildCouplingLookupTable(nodes: Node[], anchor: { lat: number; lng: number }): void {
    this.couplingLookup.clear();

    nodes.forEach(n => {
      const { r, c } = this.latLngToGrid(n.lat, n.lng, anchor);
      const cluster: number[] = [];

      // 提取 surrounding 九宫格网格索引
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const currR = r + dr;
          const currC = c + dc;
          if (currR >= 0 && currR < this.rows && currC >= 0 && currC < this.cols) {
            cluster.push(currR * this.cols + currC);
          }
        }
      }

      this.couplingLookup.set(n.id, cluster);
    });
  }

  /**
   * ⏳ 时序动态迭代器 (computeFlowStep)
   * 采用无阻力扩散波与曼宁流动方程交替迭代计算二维淹没积水，具备严格的通量限制器与质量守恒锁。
   * @param swmmOverflow 1D检查井实时产生溢流量 record (井的 ID => 溢流量 L/s)
   * @param dtSeconds 迭代递增微元步长 (秒)
   * @param manningN 粗糙度系数 (默认高品质地表漫流估算设为 0.05)
   */
  public computeFlowStep(
    swmmOverflow: Record<string, number>,
    dtSeconds: number,
    manningN: number = 0.05
  ): void {
    const size = this.rows * this.cols;
    const cellArea = this.gridSize * this.gridSize;

    // --- Part 1: 1D 溢流量平摊打散至 2D 九宫格 (1D -> 2D 排水反涌耦合) ---
    for (const nodeId in swmmOverflow) {
      const overflowLps = swmmOverflow[nodeId];
      if (overflowLps <= 0) continue;

      const cluster = this.couplingLookup.get(nodeId);
      if (!cluster || cluster.length === 0) continue;

      // 1 L/s = 0.001 m3/s. 经过累计水量： m3
      const deltaVolM3 = (overflowLps / 1000) * dtSeconds;
      const volPerCell = deltaVolM3 / cluster.length;
      const depthChange = volPerCell / cellArea;

      cluster.forEach(cellIdx => {
        this.waterDepthArray[cellIdx] += depthChange;
      });
    }

    // --- Part 2: 2D 地表浅层重力扩散漫流模拟 ---
    // 动态分配两个物理更新缓存，完全抑制局部质量耗损和数值振荡
    const deltaVolume = new Float32Array(size); // 平面多向交换净体积增量 (m3)
    const proposedOutflowVol = new Float32Array(size); // 总出流需求叠加 (用于通量质量闭环保护)

    interface CellExchange {
      fromIdx: number;
      toIdx: number;
      val: number; // m3
    }

    const exchangeList: CellExchange[] = [];

    // 单项水动力通量计算辅助函数
    const solveWaterExchange = (idxA: number, idxB: number) => {
      const hA = this.waterDepthArray[idxA];
      const hB = this.waterDepthArray[idxB];
      const demA = this.demArray[idxA];
      const demB = this.demArray[idxB];

      const HA = demA + hA;
      const HB = demB + hB;

      if (Math.abs(HA - HB) < 0.001) return; // 小于1毫米水力表面梯度，不激发漫流

      let upIdx = idxA;
      let downIdx = idxB;
      let diff = HA - HB;

      if (HB > HA) {
        upIdx = idxB;
        downIdx = idxA;
        diff = HB - HA;
      }

      // 检验漫流源点是否低于水膜临界值
      if (this.waterDepthArray[upIdx] < 0.001) return; 

      // 堰顶过流界面标高：必须高过两个格子的纯地表原最高点高程
      const barrier = Math.max(demA, demB);
      const hActive = Math.max(0, Math.max(HA, HB) - barrier);

      if (hActive < 0.001) return; // 水深还未越过边界绝壁障碍，无法溢出

      // 曼宁平均坡降流速推演
      const slope = diff / this.gridSize;
      const velocity = (1.0 / manningN) * Math.pow(hActive, 2 / 3) * Math.sqrt(slope);
      
      // 平面跨过截面流量: Q = v * A = v * (hActive * gridSize)
      const Q = velocity * hActive * this.gridSize; // m3/s
      let transferM3 = Q * dtSeconds;

      // 🚨 CFL 稳定性极值限制：单次交换流速不得越过浅水波前传导极限 speed: v = sqrt(g * hActive)
      const celerity = Math.sqrt(9.81 * hActive);
      const safeVelocity = Math.min(velocity, celerity * 0.5);
      const maxSafeVolume = safeVelocity * hActive * this.gridSize * dtSeconds;
      if (transferM3 > maxSafeVolume) {
        transferM3 = maxSafeVolume;
      }

      exchangeList.push({ fromIdx: upIdx, toIdx: downIdx, val: transferM3 });
      proposedOutflowVol[upIdx] += transferM3;
    };

    // 1. 横向通道检查
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const idxA = r * this.cols + c;
        const idxB = idxA + 1;
        solveWaterExchange(idxA, idxB);
      }
    }

    // 2. 纵向通道检查
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idxA = r * this.cols + c;
        const idxB = idxA + this.cols;
        solveWaterExchange(idxA, idxB);
      }
    }

    // --- Part 3: 锁死质量守恒与通量重分配 (Flux Limiter to Prevent Negative Depths) ---
    const cellScalers = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const maxVolume = this.waterDepthArray[i] * cellArea;
      if (proposedOutflowVol[i] > 0) {
        cellScalers[i] = proposedOutflowVol[i] > maxVolume ? (maxVolume / proposedOutflowVol[i]) : 1.0;
      } else {
        cellScalers[i] = 1.0;
      }
    }

    // 清空速度矩阵
    this.velocityX.fill(0);
    this.velocityY.fill(0);

    // 映射水量转移
    exchangeList.forEach(item => {
      const scale = cellScalers[item.fromIdx];
      const actualFlowVolume = item.val * scale;

      deltaVolume[item.fromIdx] -= actualFlowVolume;
      deltaVolume[item.toIdx] += actualFlowVolume;

      // 特征流速分解
      const rFrom = Math.floor(item.fromIdx / this.cols);
      const cFrom = item.fromIdx % this.cols;
      const rTo = Math.floor(item.toIdx / this.cols);
      const cTo = item.toIdx % this.cols;

      const dc = cTo - cFrom;
      const dr = rFrom - rTo; 

      const signX = dc !== 0 ? Math.sign(dc) : 0;
      const signY = dr !== 0 ? Math.sign(dr) : 0;

      const qRate = actualFlowVolume / dtSeconds;
      const flowArea = Math.max(0.01, this.waterDepthArray[item.fromIdx]) * this.gridSize;
      const actSpeed = qRate / flowArea;

      if (signX !== 0) {
        this.velocityX[item.fromIdx] += signX * actSpeed;
        this.velocityX[item.toIdx] += signX * actSpeed;
      }
      if (signY !== 0) {
        this.velocityY[item.fromIdx] += signY * actSpeed;
        this.velocityY[item.toIdx] += signY * actSpeed;
      }
    });

    // 水深更新落库，禁止低于绝对零度
    for (let i = 0; i < size; i++) {
      const depthOffset = deltaVolume[i] / cellArea;
      this.waterDepthArray[i] = Math.max(0, this.waterDepthArray[i] + depthOffset);
    }
  }
}

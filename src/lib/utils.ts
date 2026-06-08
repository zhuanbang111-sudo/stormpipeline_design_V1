import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 计算多边形面积 (公顷 ha)
 * 使用经纬度坐标，通过平面近似转换为平方米后计算
 */
export function calculatePolygonArea(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0;

  const R = 6371000; // 地球平均半径 (米)
  
  // 计算中心纬度用于经度缩放
  const avgLat = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length * Math.PI / 180;
  const cosLat = Math.cos(avgLat);

  // 转换为平面坐标 (米)
  const points = polygon.map(p => ({
    x: p[1] * Math.PI / 180 * R * cosLat,
    y: p[0] * Math.PI / 180 * R
  }));

  // 鞋带公式计算面积
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  area = Math.abs(area) / 2;
  
  // 转换为公顷 (1 ha = 10000 m2)
  const ha = area / 10000;
  if (ha < 0.1) {
    return parseFloat(ha.toFixed(4)); // 对于较小的自主绘制汇水区，保留4位小数，防止硬编码或精度丢失
  }
  return parseFloat(ha.toFixed(2));
}

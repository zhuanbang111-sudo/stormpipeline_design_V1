import React, { useState, useEffect, useMemo } from 'react';
import { ImageOverlay } from 'react-leaflet';

interface FloodOverlayProps {
  waterDepthArray: Float32Array | null | undefined;
  rows: number;
  cols: number;
  gridSize?: number; // 默认 12.5米
  anchor: { lat: number; lng: number } | null | undefined;
}

/**
 * 🌊 FloodOverlay: 一二维耦合地表漫流与积水深度的高性能 Canvas 直写渲染组件.
 * 使用 HTML5 Canvas 的 ImageData 格式，以 O(N) 的极速直接控制底层 RGBA 像素矩阵，
 * 彻底消除数万网格在 React vDOM 重绘中的 GC (垃圾回收) 与渲染卡顿问题。
 * 支持 Leaflet 视口自动同步与 crisp-edges/pixelated 像素感网格融合。
 */
export default function FloodOverlay({
  waterDepthArray,
  rows,
  cols,
  gridSize = 12.5,
  anchor
}: FloodOverlayProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // 1. 监测水深数组并实时将其像素级直写渲染到 Offscreen Canvas
  useEffect(() => {
    if (!waterDepthArray || rows <= 0 || cols <= 0) {
      setImageUrl(null);
      return;
    }

    const size = rows * cols;
    if (waterDepthArray.length !== size) {
      console.warn(`FloodOverlay: 水深数组维度 ${waterDepthArray.length} 不匹配网格尺寸 ${rows}x${cols}`);
      return;
    }

    // 建立临时离屏 Canvas 缓冲区
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // 利用 ImageData 避免逐点 fillRect, 极大降低指令吞吐开销以及 DOM 树计算时间
    const imgData = ctx.createImageData(cols, rows);
    const data = imgData.data;

    for (let i = 0; i < size; i++) {
      const depth = waterDepthArray[i];
      const pixelIdx = i * 4;

      if (depth <= 0.01) {
        // 水深小于 1cm 设为完全透明 (Alpha = 0)
        data[pixelIdx] = 0;     // Red
        data[pixelIdx + 1] = 0; // Green
        data[pixelIdx + 2] = 0; // Blue
        data[pixelIdx + 3] = 0; // Alpha
      } else if (depth < 0.15) {
        // 0.01m < depth < 0.15m (浅内涝：清澈浅蓝色，Alpha = 120 中等透明度)
        data[pixelIdx] = 56;    // Red
        data[pixelIdx + 1] = 189; // Green
        data[pixelIdx + 2] = 248; // Blue
        data[pixelIdx + 3] = 120; // Alpha
      } else if (depth < 0.3) {
        // 0.15m <= depth < 0.3m (中度受淹临界值：深亮海蓝色，Alpha = 200 较高不透明度)
        data[pixelIdx] = 29;    // Red
        data[pixelIdx + 1] = 78;  // Green
        data[pixelIdx + 2] = 216; // Blue
        data[pixelIdx + 3] = 200; // Alpha
      } else {
        // depth >= 0.3m (重度内涝高危看海报警状态：高亮警示红紫色/紫红色，Alpha = 240)
        data[pixelIdx] = 192;   // Red
        data[pixelIdx + 1] = 38;  // Green
        data[pixelIdx + 2] = 211; // Blue
        data[pixelIdx + 3] = 240; // Alpha
      }
    }

    // 将高速写入的二值水深渲染写入 Canvas
    ctx.putImageData(imgData, 0, 0);

    try {
      const dataUrl = canvas.toDataURL('image/png');
      setImageUrl(dataUrl);
    } catch (e) {
      console.error('Failed to create Image DataURL for 2D flow visualization', e);
    }

    // 内存垃圾显式清理
    return () => {
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [waterDepthArray, rows, cols]);

  // 2. 将一维格网在真实地理信息空间 (WGS84 投影) 内进行范围包围盒构建
  const bounds = useMemo(() => {
    if (!anchor || rows <= 0 || cols <= 0) return null;

    // 东西、南北向米数绝对边界
    const xMin = -cols / 2 * gridSize;
    const xMax = cols / 2 * gridSize;
    const yMin = -rows / 2 * gridSize;
    const yMax = rows / 2 * gridSize;

    // 转换至 WGS84 经纬度绝对区间
    const latSouth = anchor.lat + yMin / 111320;
    const latNorth = anchor.lat + yMax / 111320;
    
    // 考虑纬度收缩计算东西向经度尺度
    const metersPerDegreeLng = 111320 * Math.cos(anchor.lat * Math.PI / 180);
    const lngWest = anchor.lng + xMin / metersPerDegreeLng;
    const lngEast = anchor.lng + xMax / metersPerDegreeLng;

    // Leaflet bounds standard: [[south, west], [north, east]]
    return [
      [latSouth, lngWest],
      [latNorth, lngEast]
    ] as [[number, number], [number, number]];
  }, [anchor, rows, cols, gridSize]);

  if (!imageUrl || !bounds) {
    return null;
  }

  // 3. 返回 Leaflet React 图层，利用 imageRendering: 'pixelated' 开启无损、棱角分明的现代数字孪生质感
  return (
    <ImageOverlay
      url={imageUrl}
      bounds={bounds}
      zIndex={450}
      className="pointer-events-none mix-blend-multiply image-render-pixelated cursor-default"
      opacity={0.85}
    />
  );
}

import React, { useRef, useState, useEffect } from 'react';
import { usePipelineStore } from '../store/usePipelineStore';

interface PipeProfileCanvasProps {
  activeLinkId: string | null;
}

export default function PipeProfileCanvas({ activeLinkId }: PipeProfileCanvasProps) {
  const { nodes, links, updateNodeBottomElev } = usePipelineStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 260 });

  // Track dragging state
  // draggingNodeId === 'upstream' | 'downstream' to identify which end of activeLinkId is dragged
  const [draggingEnd, setDraggingEnd] = useState<'upstream' | 'downstream' | null>(null);

  // ResizeObserver to support responsive layouts
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 300),
          height: Math.max(height, 240)
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  if (!activeLinkId) {
    return (
      <div 
        ref={containerRef}
        className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900 border border-slate-850 rounded-xl text-slate-400 select-none text-center"
      >
        <svg className="w-12 h-12 text-slate-650 mb-3 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-sm font-semibold tracking-wide text-slate-350">未选择管线或检查井对</span>
        <span className="text-xs text-slate-550 mt-1">请在地图上点击选择排水管线，进行纵剖面深度实时可视化调整。</span>
      </div>
    );
  }

  // Find linked line
  const link = links.find((l) => l.id === activeLinkId);
  if (!link) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4 bg-slate-900 border border-slate-800 rounded-xl text-rose-450 text-sm">
        所选管段 ID ({activeLinkId}) 不存在
      </div>
    );
  }

  const upstreamNode = nodes.find((n) => n.id === link.source);
  const downstreamNode = nodes.find((n) => n.id === link.target);

  if (!upstreamNode || !downstreamNode) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4 bg-slate-900 border border-slate-800 rounded-xl text-rose-450 text-sm">
        无法解析该管线连接的检查井拓扑对
      </div>
    );
  }

  // Vertical scaling logic
  // Let's draw heights inside SVG. Scaled automatically.
  const upGround = upstreamNode.groundElevation;
  const upBottom = upstreamNode.bottomElevation;
  const downGround = downstreamNode.groundElevation;
  const downBottom = downstreamNode.bottomElevation;

  const grounds = [upGround, downGround];
  const bottoms = [upBottom, downBottom];

  const minElev = Math.min(...bottoms) - 1.5;
  const maxElev = Math.max(...grounds) + 1.5;
  const elevRange = Math.max(0.2, maxElev - minElev);

  const paddingYTop = 40;
  const paddingYBottom = 40;
  const renderHeight = dimensions.height - paddingYTop - paddingYBottom;

  // Elevation-to-Y mapping (high elevation sits at smaller SVG Y-coordinate)
  const getSvgY = (elev: number) => {
    const ratio = (maxElev - elev) / elevRange;
    return paddingYTop + ratio * renderHeight;
  };

  // Y-to-Elevation mapping
  const getElevFromY = (y: number) => {
    const ratio = (y - paddingYTop) / renderHeight;
    const val = maxElev - ratio * elevRange;
    return val;
  };

  const leftX = 120;
  const rightX = dimensions.width - 120;

  // Node diameters/Widths represented as rectangles
  const manholePixelWidth = 24;

  const upGroundY = getSvgY(upGround);
  const upBottomY = getSvgY(upBottom);
  const downGroundY = getSvgY(downGround);
  const downBottomY = getSvgY(downBottom);

  // Slope design
  const drop = upBottom - downBottom;
  const slopePermille = link.length > 0 ? (drop / link.length) * 1000 : 0;

  // Dynamic tracking during mouse move
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!draggingEnd) return;

    const svgRect = event.currentTarget.getBoundingClientRect();
    const mouseY = event.clientY - svgRect.top;

    let targetElev = getElevFromY(mouseY);
    // Boundary Guards: bottom cannot exceed ground level
    if (draggingEnd === 'upstream') {
      targetElev = Math.min(upGround - 0.2, targetElev);
      updateNodeBottomElev(upstreamNode.id, Number(targetElev.toFixed(3)));
    } else {
      targetElev = Math.min(downGround - 0.2, targetElev);
      updateNodeBottomElev(downstreamNode.id, Number(targetElev.toFixed(3)));
    }
  };

  const handleMouseUpOrLeave = () => {
    setDraggingEnd(null);
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-slate-950 border border-slate-800 rounded-xl relative overflow-hidden flex flex-col p-2 select-none"
    >
      {/* Header controls info */}
      <div className="absolute top-2 left-3 flex gap-4 text-[10px] sm:text-xs font-semibold z-10 text-slate-400">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
          地高(Gr)
        </span>
        <span className="flex items-center gap-1.5 text-orange-400">
          <span className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></span>
          底高(Inv) Anchor - 拖曳垂直调节
        </span>
        <span className="text-sky-400 font-mono">
          长: {link.length}m | 坡度: {slopePermille.toFixed(2)} ‰
        </span>
      </div>

      <svg 
        className="w-full flex-1"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      >
        <defs>
          {/* Subtle gridded background */}
          <pattern id="profilePattern" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#ffffff04" strokeWidth="1" />
          </pattern>
          {/* Neon gradient for fluids */}
          <linearGradient id="fluidGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.25" />
          </linearGradient>
          {/* Pipe slope gradient representation */}
          <linearGradient id="pipeGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        </defs>

        {/* Backdrop patterns */}
        <rect width="100%" height="100%" fill="url(#profilePattern)" />

        {/* SVG ground line representation */}
        <path 
          d={`M 0,${(upGroundY + downGroundY) / 2} L ${leftX},${upGroundY} L ${rightX},${downGroundY} L ${dimensions.width},${(upGroundY + downGroundY) / 2}`} 
          fill="none" 
          stroke="#10b981" 
          strokeWidth="2.5" 
          strokeDasharray="4,4" 
        />

        {/* Terrain Fill Backdrop */}
        <path 
          d={`M 0,${dimensions.height} L 0,${(upGroundY + downGroundY) / 2} L ${leftX},${upGroundY} L ${rightX},${downGroundY} L ${dimensions.width},${(upGroundY + downGroundY) / 2} L ${dimensions.width},${dimensions.height} Z`}
          fill="#052e160e"
        />

        {/* 1. Pipe link polygon representation (Manning cross section representation) */}
        {/* Draw a thick line or double line representing pipe of link.diameter (converted) */}
        {/* For graphical visualization, height multiplier based on diameter */}
        {(() => {
          const upDiaOffset = Math.max(5, (link.diameter / 1000) * 20);
          const downDiaOffset = Math.max(5, (link.diameter / 1000) * 20);

          return (
            <>
              {/* Outer Pipe casing representation */}
              <polygon
                points={`
                  ${leftX},${upBottomY - upDiaOffset}
                  ${rightX},${downBottomY - downDiaOffset}
                  ${rightX},${downBottomY}
                  ${leftX},${upBottomY}
                `}
                fill="url(#pipeGradient)"
                stroke="#64748b"
                strokeWidth="1.5"
                opacity="0.85"
              />
              {/* Fluid representing water level inside pipe (if simulator calculates depth / waterLevel) */}
              <polygon
                points={`
                  ${leftX},${upBottomY - upDiaOffset * Math.min(1.0, upstreamNode.waterLevel / (link.diameter / 1000 || 1))}
                  ${rightX},${downBottomY - downDiaOffset * Math.min(1.0, downstreamNode.waterLevel / (link.diameter / 1000 || 1))}
                  ${rightX},${downBottomY}
                  ${leftX},${upBottomY}
                `}
                fill="url(#fluidGradient)"
                stroke="#0ea5e9"
                strokeWidth="1"
                opacity="0.7"
              />
            </>
          );
        })()}

        {/* 2. Left Manhole representation (Upstream) */}
        <rect
          x={leftX - manholePixelWidth / 2}
          y={upGroundY}
          width={manholePixelWidth}
          height={Math.max(10, upBottomY - upGroundY)}
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="2"
          rx="2"
          opacity="0.9"
        />
        {/* Left Manhole inner fluid level */}
        {upstreamNode.waterLevel > 0 && (
          <rect
            x={leftX - manholePixelWidth / 2 + 1}
            y={getSvgY(upBottom + upstreamNode.waterLevel)}
            width={manholePixelWidth - 2}
            height={Math.max(1, upBottomY - getSvgY(upBottom + upstreamNode.waterLevel))}
            fill="#0284c7"
            opacity="0.5"
            rx="1"
          />
        )}

        {/* 3. Right Manhole representation (Downstream) */}
        <rect
          x={rightX - manholePixelWidth / 2}
          y={downGroundY}
          width={manholePixelWidth}
          height={Math.max(10, downBottomY - downGroundY)}
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="2"
          rx="2"
          opacity="0.9"
        />
        {/* Right Manhole inner fluid level */}
        {downstreamNode.waterLevel > 0 && (
          <rect
            x={rightX - manholePixelWidth / 2 + 1}
            y={getSvgY(downBottom + downstreamNode.waterLevel)}
            width={manholePixelWidth - 2}
            height={Math.max(1, downBottomY - getSvgY(downBottom + downstreamNode.waterLevel))}
            fill="#0284c7"
            opacity="0.5"
            rx="1"
          />
        )}

        {/* Draw ground & inverted text tags */}
        <g fontSize="9" className="font-mono" fill="#94a3b8">
          {/* Upstream labeling */}
          <text x={leftX - 45} y={upGroundY - 8} textAnchor="end" className="fill-emerald-400 font-bold">Gr: {upGround.toFixed(2)}m</text>
          <text x={leftX - 45} y={upBottomY + 4} textAnchor="end" className="fill-orange-400 font-bold">Inv: {upBottom.toFixed(2)}m</text>
          <text x={leftX} y={upBottomY + 20} textAnchor="middle" className="text-[10px] fill-slate-350">{upstreamNode.name}</text>

          {/* Downstream labeling */}
          <text x={rightX + 45} y={downGroundY - 8} textAnchor="start" className="fill-emerald-400 font-bold">Gr: {downGround.toFixed(2)}m</text>
          <text x={rightX + 45} y={downBottomY + 4} textAnchor="start" className="fill-orange-400 font-bold">Inv: {downBottom.toFixed(2)}m</text>
          <text x={rightX} y={downBottomY + 20} textAnchor="middle" className="text-[10px] fill-slate-350">{downstreamNode.name}</text>
        </g>

        {/* 4. Display parameters in the center of the pipe path */}
        <g transform={`translate(${(leftX + rightX) / 2}, ${(upBottomY + downBottomY) / 2 - 25})`}>
          <rect 
            x="-45" 
            y="-12" 
            width="90" 
            height="18" 
            rx="4" 
            fill="#0f172aed" 
            stroke="#334155" 
            strokeWidth="1" 
          />
          <text 
            textAnchor="middle" 
            dominantBaseline="central" 
            className="fill-sky-400 font-mono text-[10px] font-bold"
          >
            i = {slopePermille.toFixed(2)} ‰
          </text>
        </g>

        {/* 5. Anchor control point - Upstream control point (Orange, glowing circle) */}
        <circle
          cx={leftX}
          cy={upBottomY}
          r="8"
          fill="#f97316"
          stroke="#fff"
          strokeWidth="2"
          className="cursor-ns-resize hover:scale-135 transition-transform"
          onMouseDown={(e) => {
            e.stopPropagation();
            setDraggingEnd('upstream');
          }}
        />

        {/* 6. Anchor control point - Downstream control point (Orange, glowing circle) */}
        <circle
          cx={rightX}
          cy={downBottomY}
          r="8"
          fill="#f97316"
          stroke="#fff"
          strokeWidth="2"
          className="cursor-ns-resize hover:scale-135 transition-transform"
          onMouseDown={(e) => {
            e.stopPropagation();
            setDraggingEnd('downstream');
          }}
        />
      </svg>
    </div>
  );
}

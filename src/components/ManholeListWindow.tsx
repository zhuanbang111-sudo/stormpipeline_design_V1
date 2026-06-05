import React, { useState } from 'react';
import Draggable from 'react-draggable';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Node, Link } from '../types';
import { cn } from '../lib/utils';
import StatefulNumberInput from './StatefulNumberInput';

interface ManholeListWindowProps {
  nodes: Node[];
  links: Link[];
  updateNode: (id: string, updates: Partial<Node>) => void;
  selectedElement: { type: 'node' | 'link' | 'catchment', id: string } | null;
  setSelectedElement: (el: { type: 'node' | 'link' | 'catchment', id: string } | null) => void;
  onClose: () => void;
}

export default function ManholeListWindow({
  nodes,
  links,
  updateNode,
  selectedElement,
  setSelectedElement,
  onClose
}: ManholeListWindowProps) {
  const [size, setSize] = useState({ width: 700, height: 450 });
  const [isMinimized, setIsMinimized] = useState(false);
  const nodeRef = React.useRef(null);

  const manholes = nodes.filter(n => n.type === 'manhole');

  const getConnectedPipes = (nodeId: string) => {
    return links
      .filter(l => l.fromNodeId === nodeId || l.toNodeId === nodeId)
      .map(l => l.name)
      .join(', ');
  };

  return (
    <Draggable 
      nodeRef={nodeRef}
      handle=".window-header" 
      bounds="parent"
      defaultPosition={{ x: 300, y: 100 }}
    >
      <div 
        ref={nodeRef}
        className={cn(
          "fixed z-[1000] bg-white shadow-2xl border border-gray-200 rounded-lg flex flex-col overflow-hidden",
          isMinimized ? "h-10 w-64" : ""
        )}
        style={{ 
          width: isMinimized ? undefined : size.width, 
          height: isMinimized ? undefined : size.height,
          resize: isMinimized ? 'none' : 'both',
          minWidth: '300px',
          minHeight: '40px'
        }}
        onMouseUp={(e) => {
          if (!isMinimized) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (rect.width > 300 && rect.height > 40) {
              setSize({ width: rect.width, height: rect.height });
            }
          }
        }}
      >
        {/* Header */}
        <div className="window-header bg-gray-800 text-white p-2 flex justify-between items-center cursor-move select-none">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider">Manhole Inventory</span>
            <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              {manholes.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-red-600 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="flex-1 overflow-auto bg-white">
            <table className="w-full text-xs border-collapse min-w-[600px]">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="border-b border-r p-2 text-left font-semibold text-gray-600 w-10">#</th>
                  <th className="border-b border-r p-2 text-left font-semibold text-gray-600">Name / ID</th>
                  <th className="border-b border-r p-2 text-left font-semibold text-gray-600">Invert Elev (m)</th>
                  <th className="border-b border-r p-2 text-left font-semibold text-gray-600">Ground Elev (m)</th>
                  <th className="border-b border-r p-2 text-left font-semibold text-gray-600">Depth (m)</th>
                  <th className="border-b border-r p-2 text-left font-semibold text-gray-600">Connected Pipes</th>
                  <th className="border-b p-2 text-left font-semibold text-gray-600">Coordinates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {manholes.map((n, idx) => (
                  <tr 
                    key={n.id} 
                    className={cn(
                      "hover:bg-blue-50/50 transition-colors cursor-pointer",
                      selectedElement?.id === n.id && "bg-blue-50"
                    )}
                    onClick={() => setSelectedElement({ type: 'node', id: n.id })}
                  >
                    <td className="p-2 border-r text-gray-400 text-center font-mono">{idx + 1}</td>
                    <td className="p-2 border-r">
                      <input 
                        type="text" 
                        value={n.name} 
                        onChange={e => updateNode(n.id, { name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 font-medium"
                      />
                    </td>
                    <td className="p-2 border-r">
                      <StatefulNumberInput 
                        value={n.elevation} 
                        onChange={newInv => {
                          const currentGrd = n.elevation + n.maxDepth;
                          updateNode(n.id, { 
                            elevation: newInv,
                            maxDepth: Math.max(0.1, currentGrd - newInv)
                          });
                        }}
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 font-mono"
                      />
                    </td>
                    <td className="p-2 border-r">
                      <StatefulNumberInput 
                        value={n.elevation + n.maxDepth} 
                        onChange={newGrd => {
                          updateNode(n.id, { maxDepth: Math.max(0.1, newGrd - n.elevation) });
                        }}
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 font-mono"
                      />
                    </td>
                    <td className="p-2 border-r text-gray-500 font-mono">
                      {n.maxDepth.toFixed(2)}
                    </td>
                    <td className="p-2 border-r text-gray-500 truncate max-w-[120px]" title={getConnectedPipes(n.id)}>
                      {getConnectedPipes(n.id) || '-'}
                    </td>
                    <td className="p-2 text-gray-400 font-mono text-[10px]">
                      {n.lat.toFixed(6)}, {n.lng.toFixed(6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {manholes.length === 0 && (
              <div className="p-10 text-center text-gray-400 italic">
                No manholes added yet. Use the "Add Manhole" tool to place some on the map.
              </div>
            )}
          </div>
        )}
        
        {/* Resize Handle Indicator (Visual only, actual resize is via CSS resize:both) */}
        {!isMinimized && (
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 pointer-events-none">
            <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-gray-300"></div>
          </div>
        )}
      </div>
    </Draggable>
  );
}

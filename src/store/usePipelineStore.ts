import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Node, Link, Catchment, SimulationResult, ToolType, NodeType, BackgroundFeature } from '../types';
import { runSimulation, SimulationParams } from '../engine/hydraulicEngine';
import { solveHydraulics } from '../engine/HydraulicStaticSolver';
import { DEFAULT_MATERIAL } from '../constants';
import { generateVoronoiGrid } from '../engine/CatchmentGenerator';
import { calculatePolygonArea } from '../lib/utils';

// We define our enhanced Node, Link, Catchment types extending the base types to support both legacy and new structures.
export interface EnhancedNode extends Node {
  x: number; // equivalent to lng
  y: number; // equivalent to lat
  groundElevation: number; // ground level (elevation + maxDepth)
  bottomElevation: number; // base level (elevation)
  waterLevel: number; // dynamic water level (meters)
  overflowRate: number; // dynamic surface flood overflow rate (L/s or m3/s)
}

export interface EnhancedLink extends Link {
  source: string; // equivalent to fromNodeId
  target: string; // equivalent to toNodeId
  slope: number; // slope, unitless (dimensionless ratio or per mille)
}

export interface EnhancedCatchment extends Catchment {
  nodeCtx: string; // equivalent to outletNodeId
  runOffCoef: number; // equivalent to runoffCoefficient
  polygonVertices: [number, number][]; // array of [lat, lng]
}

export interface PipelineState {
  nodes: EnhancedNode[];
  links: EnhancedLink[];
  catchments: EnhancedCatchment[];
  backgroundFeatures: BackgroundFeature[]; // CAD/GIS underlay features
  selectedTool: ToolType;
  selectedElement: { type: 'node' | 'link' | 'catchment', id: string } | null;
  drawingLinkFrom: string | null;
  drawingCatchmentPoints: [number, number][];
  simulationResult: SimulationResult | null;
  simulationParams: SimulationParams;
  
  // Custom timeline playing variables (Phase 5)
  currentTimeStep: number; // 0 to 120 (minutes or steps)
  isPlaying: boolean;
  playbackSpeed: number; // multiplier

  // Default values
  defaultInvertElevation: number;
  defaultGroundElevation: number;

  // History for Undo/Redo
  pastStates: Array<{
    nodes: EnhancedNode[];
    links: EnhancedLink[];
    catchments: EnhancedCatchment[];
  }>;
  futureStates: Array<{
    nodes: EnhancedNode[];
    links: EnhancedLink[];
    catchments: EnhancedCatchment[];
  }>;
}

export interface PipelineActions {
  // Core user actions requested:
  updateNodeBottomElev: (id: string, elev: number) => void;
  updateLinkDiameter: (id: string, dia: number) => void;
  addNode: (x: number, y: number, type?: NodeType) => EnhancedNode;
  addLink: (source: string, target: string) => EnhancedLink | null;
  updateCatchmentPolygon: (id: string, vertices: [number, number][]) => void;

  // Additional UI / Core actions needed for full feature integration:
  setNodes: (nodes: EnhancedNode[]) => void;
  setLinks: (links: EnhancedLink[]) => void;
  setCatchments: (catchments: EnhancedCatchment[]) => void;
  setSelectedTool: (tool: ToolType) => void;
  setSelectedElement: (elem: { type: 'node' | 'link' | 'catchment', id: string } | null) => void;
  setDrawingLinkFrom: (fromId: string | null) => void;
  setDrawingCatchmentPoints: (points: [number, number][] | ((prev: [number, number][]) => [number, number][])) => void;
  
  updateNode: (id: string, updates: Partial<EnhancedNode>) => void;
  deleteNode: (id: string) => void;
  updateLink: (id: string, updates: Partial<EnhancedLink>) => void;
  deleteLink: (id: string) => void;
  updateCatchment: (id: string, updates: Partial<EnhancedCatchment>) => void;
  deleteCatchment: (id: string) => void;

  // CAD/GIS imported background data
  addImportedData: (newBackgroundFeatures: BackgroundFeature[]) => void;
  clearBackgroundFeatures: () => void;
  generateVoronoiCatchments: () => void;

  setSimulationParams: (params: Partial<SimulationParams>) => void;
  setSimulationResult: (res: SimulationResult | null) => void;
  runSim: () => void;
  
  // Timeline Playback controls
  setCurrentTimeStep: (step: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;

  // Elevation Management
  setDefaultInvertElevation: (elev: number) => void;
  setDefaultGroundElevation: (elev: number) => void;

  // History controls
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  // Flow & sanity repairs
  reverseLinkDirection: (linkId: string) => void;
  autoMatchDownstreamDiameter: (linkId: string) => void;
}

const haversineDistance = (pt1: [number, number], pt2: [number, number]): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = pt1[0] * Math.PI / 180;
  const φ2 = pt2[0] * Math.PI / 180;
  const Δφ = (pt2[0] - pt1[0]) * Math.PI / 180;
  const Δλ = (pt2[1] - pt1[1]) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round(R * c));
};

const n1RefId = "mh-init-1";
const n2RefId = "mh-init-2";
const n3RefId = "mh-init-3";
const n4RefId = "of-init-1";

const initialNodes: EnhancedNode[] = [
  { id: n1RefId, type: 'manhole', lat: 22.545, lng: 114.055, x: 114.055, y: 22.545, elevation: 102, bottomElevation: 102, groundElevation: 105, maxDepth: 3, name: 'MH-1', waterLevel: 0, overflowRate: 0 },
  { id: n2RefId, type: 'manhole', lat: 22.545, lng: 114.058, x: 114.058, y: 22.545, elevation: 101, bottomElevation: 101, groundElevation: 104, maxDepth: 3, name: 'MH-2', waterLevel: 0, overflowRate: 0 },
  { id: n3RefId, type: 'manhole', lat: 22.543, lng: 114.058, x: 114.058, y: 22.543, elevation: 100, bottomElevation: 100, groundElevation: 103, maxDepth: 3, name: 'MH-3', waterLevel: 0, overflowRate: 0 },
  { id: n4RefId, type: 'outfall', lat: 22.541, lng: 114.058, x: 114.058, y: 22.541, elevation: 98, bottomElevation: 98, groundElevation: 101, maxDepth: 3, name: 'OF-1', waterLevel: 0, overflowRate: 0 }
];

const initialLinks: EnhancedLink[] = [
  { id: "p-init-1", fromNodeId: n1RefId, toNodeId: n2RefId, source: n1RefId, target: n2RefId, length: 250, diameter: 400, height: 400, shape: 'circular', material: DEFAULT_MATERIAL.name, roughness: DEFAULT_MATERIAL.n, name: 'P-1', slope: (102 - 101)/250 },
  { id: "p-init-2", fromNodeId: n2RefId, toNodeId: n3RefId, source: n2RefId, target: n3RefId, length: 220, diameter: 500, height: 500, shape: 'circular', material: DEFAULT_MATERIAL.name, roughness: DEFAULT_MATERIAL.n, name: 'P-2', slope: (101 - 100)/220 },
  { id: "p-init-3", fromNodeId: n3RefId, toNodeId: n4RefId, source: n3RefId, target: n4RefId, length: 220, diameter: 600, height: 600, shape: 'circular', material: DEFAULT_MATERIAL.name, roughness: DEFAULT_MATERIAL.n, name: 'P-3', slope: (100 - 98)/220 }
];

const initialCatchments: EnhancedCatchment[] = [
  {
    id: "c-init-1",
    name: 'C-1',
    area: 2.5,
    runoffCoefficient: 0.85,
    runOffCoef: 0.85,
    timeOfConcentration: 10,
    outletNodeId: n1RefId,
    nodeCtx: n1RefId,
    polygon: [[22.546, 114.054], [22.546, 114.056], [22.544, 114.056], [22.544, 114.054]],
    polygonVertices: [[22.546, 114.054], [22.546, 114.056], [22.544, 114.056], [22.544, 114.054]]
  }
];

export const usePipelineStore = create<PipelineState & PipelineActions>((set, get) => {
  // Helper to retrieve current layout snapshot
  const getSnapshot = () => {
    const { nodes, links, catchments } = get();
    return JSON.parse(JSON.stringify({ nodes, links, catchments }));
  };

  return {
    nodes: initialNodes,
    links: initialLinks,
    catchments: initialCatchments,
    backgroundFeatures: [],
    selectedTool: 'select',
    selectedElement: null,
    drawingLinkFrom: null,
    drawingCatchmentPoints: [],
    simulationResult: null,
    simulationParams: {
      method: 'rational',
      mapType: 'tianditu_vec',
      rainfallIntensity: 50,
      stormDuration: 120,
      returnPeriod: 5,
      delayCoefficient: 1.0,
      region: 'western',
      formulaParams: {
        A: 2698.815,
        C: 0.593,
        b: 11.03,
        n: 0.648
      }
    },

    currentTimeStep: 0,
    isPlaying: false,
    playbackSpeed: 1,

    defaultInvertElevation: 100,
    defaultGroundElevation: 103,

    pastStates: [],
    futureStates: [],

    undo: () => {
      const { pastStates, nodes, links, catchments, futureStates } = get();
      if (pastStates.length === 0) return;
      const previous = pastStates[pastStates.length - 1];
      set({
        nodes: previous.nodes,
        links: previous.links,
        catchments: previous.catchments,
        pastStates: pastStates.slice(0, pastStates.length - 1),
        futureStates: [{ nodes, links, catchments }, ...futureStates],
      });
    },

    redo: () => {
      const { futureStates, nodes, links, catchments, pastStates } = get();
      if (futureStates.length === 0) return;
      const next = futureStates[0];
      set({
        nodes: next.nodes,
        links: next.links,
        catchments: next.catchments,
        futureStates: futureStates.slice(1),
        pastStates: [...pastStates, { nodes, links, catchments }],
      });
    },

    pushHistory: () => {
      const { nodes, links, catchments, pastStates } = get();
      // Keep copy deep enough
      const snapshot = JSON.parse(JSON.stringify({ nodes, links, catchments }));
      set({
        pastStates: [...pastStates, snapshot],
        futureStates: [],
      });
    },

    setNodes: (nodes) => set({ nodes }),
    setLinks: (links) => set({ links }),
    setCatchments: (catchments) => set({ catchments }),
    setSelectedTool: (selectedTool) => set({ selectedTool }),
    setSelectedElement: (selectedElement) => set({ selectedElement }),
    setDrawingLinkFrom: (drawingLinkFrom) => set({ drawingLinkFrom }),
    setDrawingCatchmentPoints: (points) => set((state) => {
      const nextPoints = typeof points === 'function' ? points(state.drawingCatchmentPoints) : points;
      return { drawingCatchmentPoints: nextPoints };
    }),

    setDefaultInvertElevation: (defaultInvertElevation) => set({ defaultInvertElevation }),
    setDefaultGroundElevation: (defaultGroundElevation) => set({ defaultGroundElevation }),

    updateNodeBottomElev: (id, elev) => {
      get().pushHistory();
      set((state) => {
        const nextNodes = state.nodes.map((n) => {
          if (n.id === id) {
            const nextGround = Math.max(n.groundElevation, elev + 0.1); // Guard bottom elevation strictly below ground level
            return {
              ...n,
              bottomElevation: elev,
              elevation: elev, // Compatibility with legacy elevation
              maxDepth: nextGround - elev,
              groundElevation: nextGround,
            };
          }
          return n;
        });
        
        // Recalculate link parameters
        const nextLinks = state.links.map((l) => {
          if (l.source === id || l.target === id) {
            const fromN = nextNodes.find((n) => n.id === l.source);
            const toN = nextNodes.find((n) => n.id === l.target);
            if (fromN && toN) {
              const diff = fromN.bottomElevation - toN.bottomElevation;
              const slope = l.length > 0 ? diff / l.length : 0;
              return { ...l, slope };
            }
          }
          return l;
        });

        return { nodes: nextNodes, links: nextLinks };
      });
      get().runSim();
    },

    updateLinkDiameter: (id, dia) => {
      get().pushHistory();
      set((state) => ({
        links: state.links.map((l) => {
          if (l.id === id) {
            return {
              ...l,
              diameter: dia,
              height: dia, // Circular default height
            };
          }
          return l;
        }),
      }));
      get().runSim();
    },

    addNode: (x, y, type = 'manhole') => {
      get().pushHistory();
      let node: EnhancedNode | null = null;
      set((state) => {
        const index = state.nodes.length + 1;
        const name = `${type === 'manhole' ? 'MH' : 'OF'}-${index}`;
        node = {
          id: uuidv4(),
          type,
          lat: y, // Leaflet lat
          lng: x, // Leaflet lng
          x,
          y,
          elevation: state.defaultInvertElevation,
          bottomElevation: state.defaultInvertElevation,
          groundElevation: state.defaultGroundElevation,
          maxDepth: Math.max(0.1, state.defaultGroundElevation - state.defaultInvertElevation),
          waterLevel: 0,
          overflowRate: 0,
          name,
        };
        return { nodes: [...state.nodes, node] };
      });
      get().runSim();
      return node!;
    },

    addLink: (source, target) => {
      if (source === target) return null;
      const { nodes, links, runSim, pushHistory } = get();

      // Check duplicate
      const duplicated = links.some(
        (l) => (l.source === source && l.target === target) || (l.source === target && l.target === source)
      );
      if (duplicated) return null;

      const fromNode = nodes.find((n) => n.id === source);
      const toNode = nodes.find((n) => n.id === target);

      if (!fromNode || !toNode) return null;

      pushHistory();

      const length = haversineDistance([fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]);
      const diff = fromNode.bottomElevation - toNode.bottomElevation;
      const slope = length > 0 ? diff / length : 0;

      const newLink: EnhancedLink = {
        id: uuidv4(),
        fromNodeId: source,
        toNodeId: target,
        source,
        target,
        length,
        diameter: 300,
        height: 300,
        shape: 'circular',
        material: DEFAULT_MATERIAL.name,
        roughness: DEFAULT_MATERIAL.n,
        name: `P-${links.length + 1}`,
        slope,
      };

      set({
        links: [...links, newLink],
      });
      runSim();
      return newLink;
    },

    updateCatchmentPolygon: (id, vertices) => {
      get().pushHistory();
      set((state) => ({
        catchments: state.catchments.map((c) => {
          if (c.id === id) {
            const area = calculatePolygonArea(vertices);
            return {
              ...c,
              polygon: vertices,
              polygonVertices: vertices,
              area,
            };
          }
          return c;
        }),
      }));
      get().runSim();
    },

    updateNode: (id, updates) => {
      get().pushHistory();
      set((state) => {
        const nextNodes = state.nodes.map((n) => {
          if (n.id === id) {
            const lat = updates.lat !== undefined ? updates.lat : (updates.y !== undefined ? updates.y : n.lat);
            const lng = updates.lng !== undefined ? updates.lng : (updates.x !== undefined ? updates.x : n.lng);
            const bottom = updates.bottomElevation !== undefined ? updates.bottomElevation : (updates.elevation !== undefined ? updates.elevation : n.bottomElevation);
            const ground = updates.groundElevation !== undefined ? updates.groundElevation : (updates.maxDepth !== undefined ? (bottom + updates.maxDepth) : n.groundElevation);
            const maxDepth = Math.max(0.1, ground - bottom);

            return {
              ...n,
              ...updates,
              lat,
              lng,
              x: lng,
              y: lat,
              bottomElevation: bottom,
              elevation: bottom,
              groundElevation: ground,
              maxDepth,
            };
          }
          return n;
        });

        // Recalculate connected pipeline lengths & slopes
        const nextLinks = state.links.map((l) => {
          if (l.source === id || l.target === id) {
            const fromNode = nextNodes.find((n) => n.id === l.source);
            const toNode = nextNodes.find((n) => n.id === l.target);
            if (fromNode && toNode) {
              const length = haversineDistance([fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]);
              const diff = fromNode.bottomElevation - toNode.bottomElevation;
              const slope = length > 0 ? diff / length : 0;
              return {
                ...l,
                fromNodeId: l.source,
                toNodeId: l.target,
                length,
                slope,
              };
            }
          }
          return l;
        });

        return { nodes: nextNodes, links: nextLinks };
      });
      get().runSim();
    },

    deleteNode: (id) => {
      get().pushHistory();
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== id),
        links: state.links.filter((l) => l.source !== id && l.target !== id),
        catchments: state.catchments.map((c) => c.nodeCtx === id ? { ...c, nodeCtx: '', outletNodeId: '' } : c),
        selectedElement: state.selectedElement?.id === id ? null : state.selectedElement,
      }));
      get().runSim();
    },

    updateLink: (id, updates) => {
      get().pushHistory();
      set((state) => ({
        links: state.links.map((l) => {
          if (l.id === id) {
            const source = updates.source !== undefined ? updates.source : (updates.fromNodeId !== undefined ? updates.fromNodeId : l.source);
            const target = updates.target !== undefined ? updates.target : (updates.toNodeId !== undefined ? updates.toNodeId : l.target);
            const diameter = updates.diameter !== undefined ? updates.diameter : l.diameter;
            const roughness = updates.roughness !== undefined ? updates.roughness : l.roughness;

            return {
              ...l,
              ...updates,
              source,
              target,
              fromNodeId: source,
              toNodeId: target,
              diameter,
              height: diameter, // Circular synchronization
              roughness,
            };
          }
          return l;
        }),
      }));
      get().runSim();
    },

    deleteLink: (id) => {
      get().pushHistory();
      set((state) => ({
        links: state.links.filter((l) => l.id !== id),
        selectedElement: state.selectedElement?.id === id ? null : state.selectedElement,
      }));
      get().runSim();
    },

    updateCatchment: (id, updates) => {
      get().pushHistory();
      set((state) => ({
        catchments: state.catchments.map((c) => {
          if (c.id === id) {
            const nodeCtx = updates.nodeCtx !== undefined ? updates.nodeCtx : (updates.outletNodeId !== undefined ? updates.outletNodeId : c.nodeCtx);
            const runOffCoef = updates.runOffCoef !== undefined ? updates.runOffCoef : (updates.runoffCoefficient !== undefined ? updates.runoffCoefficient : c.runOffCoef);
            const polygon = updates.polygonVertices !== undefined ? updates.polygonVertices : (updates.polygon !== undefined ? updates.polygon : c.polygon);
            const area = (updates.polygon || updates.polygonVertices) && updates.area === undefined 
              ? calculatePolygonArea(polygon) 
              : (updates.area !== undefined ? updates.area : c.area);

            return {
              ...c,
              ...updates,
              nodeCtx,
              outletNodeId: nodeCtx,
              runOffCoef,
              runoffCoefficient: runOffCoef,
              polygon,
              polygonVertices: polygon,
              area,
            };
          }
          return c;
        }),
      }));
      get().runSim();
    },

    deleteCatchment: (id) => {
      get().pushHistory();
      set((state) => ({
        catchments: state.catchments.filter((c) => c.id !== id),
        selectedElement: state.selectedElement?.id === id ? null : state.selectedElement,
      }));
      get().runSim();
    },

    addImportedData: (newBackgroundFeatures) => {
      set((state) => ({
        backgroundFeatures: [...state.backgroundFeatures, ...newBackgroundFeatures]
      }));
    },

    clearBackgroundFeatures: () => {
      set({ backgroundFeatures: [] });
    },

    generateVoronoiCatchments: () => {
      const { nodes, pushHistory, runSim } = get();
      const targetNodes = nodes.filter(n => n.type === 'manhole');
      if (targetNodes.length < 3) {
        alert("自动划分汇水区需要至少 3 个检查井（Manhole）节点进行空间计算！");
        return;
      }
      try {
        pushHistory();
        const generated = generateVoronoiGrid(nodes);
        set({
          catchments: generated
        });
        runSim();
      } catch (err: any) {
        console.error("Failed to generate Voronoi diagrams:", err);
        alert("自动化划分计算失败: " + (err.message || err));
      }
    },

    setSimulationParams: (updates) => {
      set((state) => ({
        simulationParams: {
          ...state.simulationParams,
          ...updates,
        },
      }));
      get().runSim();
    },

    setSimulationResult: (simulationResult) => set({ simulationResult }),

    runSim: () => {
      const { nodes, links, catchments, simulationParams } = get();
      if (nodes.length === 0) return;
      try {
        const result = runSimulation(nodes, links, catchments, simulationParams);

        // Run the industrial-grade HydraulicStaticSolver
        const formulaParams = {
          A1: (simulationParams.formulaParams?.A ?? 2698.815) / 167,
          C: simulationParams.formulaParams?.C ?? 0.593,
          b: simulationParams.formulaParams?.b ?? 11.03,
          n: simulationParams.formulaParams?.n ?? 0.648
        };

        const staticSolverResult = solveHydraulics(
          nodes,
          links,
          catchments,
          simulationParams.returnPeriod,
          simulationParams.stormDuration,
          formulaParams
        );

        // Map computed static solver depths and flow overflow rates to store elements in a single update
        const updatedNodes = nodes.map(node => {
          const depth = Math.max(0, (staticSolverResult.nodeWaterLevels[node.id] ?? node.bottomElevation) - node.bottomElevation);
          const spill = staticSolverResult.nodeOverflowRates[node.id] ?? 0;
          return {
            ...node,
            waterLevel: Number(depth.toFixed(3)),
            overflowRate: Number(spill.toFixed(3))
          };
        });

        set({
          nodes: updatedNodes,
          simulationResult: result
        });
      } catch (err) {
        console.error('Error running simulation inside Zustand:', err);
      }
    },

    setCurrentTimeStep: (currentTimeStep) => set({ currentTimeStep }),
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

    reverseLinkDirection: (linkId) => {
      get().pushHistory();
      set((state) => {
        const nextLinks = state.links.map((l) => {
          if (l.id === linkId) {
            const nextSource = l.target;
            const nextTarget = l.source;
            const fromN = state.nodes.find((n) => n.id === nextSource);
            const toN = state.nodes.find((n) => n.id === nextTarget);
            let slope = l.slope;
            if (fromN && toN) {
              const diff = fromN.bottomElevation - toN.bottomElevation;
              slope = l.length > 0 ? diff / l.length : 0;
            }
            return {
              ...l,
              source: nextSource,
              target: nextTarget,
              fromNodeId: nextSource,
              toNodeId: nextTarget,
              slope
            };
          }
          return l;
        });
        return { links: nextLinks };
      });
      get().runSim();
    },

    autoMatchDownstreamDiameter: (linkId) => {
      get().pushHistory();
      set((state) => {
        const link = state.links.find(l => l.id === linkId);
        if (!link) return {};
        const upstreamLinks = state.links.filter(l => l.target === link.source);
        const maxUpstreamDiameter = upstreamLinks.reduce((max, l) => Math.max(max, l.diameter || 0), 0);
        const targetDia = maxUpstreamDiameter > 0 ? maxUpstreamDiameter : 1000;
        
        const nextLinks = state.links.map((l) => {
          if (l.id === linkId) {
            return {
              ...l,
              diameter: targetDia,
              height: targetDia,
            };
          }
          return l;
        });
        return { links: nextLinks };
      });
      get().runSim();
    },
  };
});

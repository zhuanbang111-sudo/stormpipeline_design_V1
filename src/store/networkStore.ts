import { usePipelineStore } from './usePipelineStore';
import { Node, Link, Catchment, ToolType, SimulationResult, BackgroundFeature } from '../types';
import { calculatePolygonArea } from '../lib/utils';

export interface NetworkState {
  nodes: Node[];
  links: Link[];
  catchments: Catchment[];
  backgroundFeatures: BackgroundFeature[];
}

/**
 * Compatibility bridge mapping old state hooks to modern Zustand store usePipelineStore.
 * Ensures all existing systems remain 100% compliant without code breakages.
 */
export function useNetworkStore() {
  const store = usePipelineStore();

  return {
    nodes: store.nodes,
    links: store.links,
    catchments: store.catchments,
    backgroundFeatures: store.backgroundFeatures,
    
    // Core actions
    addNode: (lat: number, lng: number, type?: 'manhole' | 'outfall') => store.addNode(lng, lat, type),
    updateNode: store.updateNode,
    deleteNode: store.deleteNode,
    
    addLink: (fromNodeId: string, toNodeId: string) => store.addLink(fromNodeId, toNodeId),
    updateLink: store.updateLink,
    deleteLink: store.deleteLink,
    insertNodeIntoLink: (linkId: string, clickX: number, clickY: number) => store.insertNodeIntoLink(linkId, clickX, clickY),
    reorderNetworkTopology: store.reorderNetworkTopology,
    
    addCatchment: (catchmentOrPolygon: any, outletNodeId?: string) => {
      if (Array.isArray(catchmentOrPolygon)) {
        const id = `c-${Date.now()}`;
        const calculatedArea = calculatePolygonArea(catchmentOrPolygon);
        const newC = {
          id,
          name: `C-${store.catchments.length + 1}`,
          area: calculatedArea > 0 ? calculatedArea : 0.01,
          runoffCoefficient: 0.8,
          runOffCoef: 0.8,
          timeOfConcentration: 10,
          outletNodeId: outletNodeId || '',
          nodeCtx: outletNodeId || '',
          polygon: catchmentOrPolygon,
          polygonVertices: catchmentOrPolygon
        };
        store.setCatchments([...store.catchments, newC]);
      } else {
        store.setCatchments([...store.catchments, {
          ...catchmentOrPolygon,
          nodeCtx: catchmentOrPolygon.outletNodeId || '',
          runOffCoef: catchmentOrPolygon.runoffCoefficient,
          polygonVertices: catchmentOrPolygon.polygon
        }]);
      }
      store.runSim();
    },
    updateCatchment: store.updateCatchment,
    deleteCatchment: store.deleteCatchment,
    
    addImportedData: store.addImportedData,
    clearBackgroundFeatures: store.clearBackgroundFeatures,
    generateVoronoiCatchments: store.generateVoronoiCatchments,
    
    selectedTool: store.selectedTool,
    setSelectedTool: store.setSelectedTool,
    
    selectedElement: store.selectedElement,
    setSelectedElement: store.setSelectedElement,
    
    drawingLinkFrom: store.drawingLinkFrom,
    setDrawingLinkFrom: store.setDrawingLinkFrom,
    
    drawingCatchmentPoints: store.drawingCatchmentPoints,
    setDrawingCatchmentPoints: store.setDrawingCatchmentPoints,
    
    simulationResult: store.simulationResult,
    runSim: store.runSim,
    
    simulationParams: store.simulationParams,
    setSimulationParams: store.setSimulationParams,
    
    defaultInvertElevation: store.defaultInvertElevation,
    setDefaultInvertElevation: store.setDefaultInvertElevation,
    
    defaultGroundElevation: store.defaultGroundElevation,
    setDefaultGroundElevation: store.setDefaultGroundElevation,
    
    undo: store.undo,
    redo: store.redo,
    canUndo: store.pastStates.length > 0,
    canRedo: store.futureStates.length > 0,

    // Cloud scenario sync integration
    isSaving: store.isSaving,
    cloudScenarios: store.cloudScenarios,
    fetchCloudScenarios: store.fetchCloudScenarios,
    syncScenarioToCloud: store.syncScenarioToCloud,
    loadCloudScenario: store.loadCloudScenario,
    deleteCloudScenario: store.deleteCloudScenario
  };
}

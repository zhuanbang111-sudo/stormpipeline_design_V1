import * as turf from '@turf/turf';
import { usePipelineStore, EnhancedNode, EnhancedLink } from '../store/usePipelineStore';
import { v4 as uuidv4 } from 'uuid';

/**
 * Case-insensitive property extractor helper to tolerate different GIS attribute naming conventions (e.g., uppercase, snake_case)
 */
function getPropertyByKeys(properties: any, keys: string[]): any {
  if (!properties) return undefined;
  const lowerKeys = keys.map(k => k.toLowerCase());
  for (const key of Object.keys(properties)) {
    if (lowerKeys.includes(key.toLowerCase())) {
      return properties[key];
    }
  }
  return undefined;
}

/**
 * Robust Diameter/Size parser and unit converter
 * Handles forms like: 300, 0.3, "DN300", "400mm", "0.6m"
 */
function parseDiameter(val: any): number {
  if (val === undefined || val === null) {
    return 400; // default standard pipe size (mm)
  }

  if (typeof val === 'number') {
    // If it's a small decimal number like 0.3 or 1.2, it's represented in meters. Convert to mm.
    if (val > 0 && val < 5) {
      return Math.round(val * 1000);
    }
    return val;
  }

  if (typeof val === 'string') {
    // Extract the first numerical string sequence (integer or decimal)
    const match = val.match(/\d+(\.\d+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      if (num > 0 && num < 5) {
        return Math.round(num * 1000);
      }
      return num;
    }
  }

  return 400; // fallback standard diameter
}

/**
 * Precision Earth distance calculator (returns distance in meters) between raw coordinate coordinates
 */
function calculateGeodeticDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 1. importNodesFromGeoJson: Parses Point geometries from GeoJSON, heals missing attributes, and writes to Zustand Store
 * @param geoJsonData Standard GeoJSON input
 * @returns Array of successfully imported/merged EnhancedNode items
 */
export function importNodesFromGeoJson(geoJsonData: any): EnhancedNode[] {
  if (!geoJsonData) return [];

  // Parse list of features
  let features: any[] = [];
  if (geoJsonData.type === 'FeatureCollection' && Array.isArray(geoJsonData.features)) {
    features = geoJsonData.features;
  } else if (geoJsonData.type === 'Feature') {
    features = [geoJsonData];
  } else {
    // Support raw arrays of features
    features = Array.isArray(geoJsonData) ? geoJsonData : [geoJsonData];
  }

  const store = usePipelineStore.getState();
  const defaultGround = store.defaultGroundElevation || 103.0;
  const importedNodes: EnhancedNode[] = [];

  features.forEach((feature, idx) => {
    // Inspect point elements exclusively
    if (!feature || !feature.geometry || feature.geometry.type !== 'Point') {
      return;
    }

    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;

    const lng = coords[0];
    const lat = coords[1];
    const properties = feature.properties || {};

    // 1. Map Core ID to Well_ID, Name, or autogenerate
    const rawId = getPropertyByKeys(properties, ['Well_ID', 'WellID', 'Name', 'id', 'node_id', 'nodeid', 'objectid']);
    const id = rawId ? String(rawId).trim() : `MH-Import-${idx + 1}-${uuidv4().substring(0, 5)}`;

    // 2. Map Ground level elevation
    const groundVal = getPropertyByKeys(properties, ['Ground_Elev', 'ground_elev', 'ground_elevation', 'GroundElevation', 'groundElevation', 'surface_elev', 'H_ground']);
    let groundElevation = parseFloat(groundVal);
    if (isNaN(groundElevation)) {
      groundElevation = defaultGround;
    }

    // 3. Map Invert bottom level elevation
    const bottomVal = getPropertyByKeys(properties, ['Bottom_Elev', 'bottom_elev', 'bottom_elevation', 'BottomElevation', 'bottomElevation', 'invert_elev', 'InvertElev', 'H_invert']);
    let bottomElevation = parseFloat(bottomVal);
    if (isNaN(bottomElevation)) {
      // Default depth of 2.5 meters below ground to self-heal
      bottomElevation = Number((groundElevation - 2.5).toFixed(2));
    }

    // Derive node styling, standard name and parameters
    const nodeName = getPropertyByKeys(properties, ['Name', 'Well_ID', 'name', 'label', 'code']) || id;

    const parsedNode: EnhancedNode = {
      id,
      name: String(nodeName),
      type: 'manhole', // Default point representation is check manhole
      lat,
      lng,
      x: lng,
      y: lat,
      elevation: bottomElevation, // Elevation represents tube bottom elevation in the hydraulic engine
      bottomElevation,
      groundElevation,
      maxDepth: Number((groundElevation - bottomElevation).toFixed(2)),
      waterLevel: 0,
      overflowRate: 0
    };

    importedNodes.push(parsedNode);
  });

  if (importedNodes.length > 0) {
    // Fetch and merge with existing state nodes (prevent duplication)
    const existingNodes = store.nodes;
    const mergedNodesMap = new Map<string, EnhancedNode>();
    existingNodes.forEach(n => mergedNodesMap.set(n.id.toLowerCase(), n));
    importedNodes.forEach(n => mergedNodesMap.set(n.id.toLowerCase(), n));

    const finalNodes = Array.from(mergedNodesMap.values());

    // Record Action to history stack
    store.pushHistory();
    // Batch set node geometries inside the Zustand Store
    usePipelineStore.setState({ nodes: finalNodes });
    console.log(`[GisDataImporter] Successfully imported/merged ${importedNodes.length} nodes to Store.`);
  }

  return importedNodes;
}

/**
 * 2. importLinksFromGeoJson: Parses LineString geometries from GeoJSON, matches to nodes, computes geodetic length, and writes to Zustand Store
 * @param geoJsonData Standard GeoJSON input with LineString features
 * @returns Array of successfully imported EnhancedLink items
 */
export function importLinksFromGeoJson(geoJsonData: any): EnhancedLink[] {
  if (!geoJsonData) return [];

  let features: any[] = [];
  if (geoJsonData.type === 'FeatureCollection' && Array.isArray(geoJsonData.features)) {
    features = geoJsonData.features;
  } else if (geoJsonData.type === 'Feature') {
    features = [geoJsonData];
  } else {
    features = Array.isArray(geoJsonData) ? geoJsonData : [geoJsonData];
  }

  const store = usePipelineStore.getState();
  const currentNodes = [...store.nodes]; // read current nodes state
  const importedLinks: EnhancedLink[] = [];
  const newlyCreatedNodes: EnhancedNode[] = []; // for automatic self-healing manhole creations

  features.forEach((feature, idx) => {
    if (!feature || !feature.geometry || feature.geometry.type !== 'LineString') {
      return;
    }

    const coords = feature.geometry.coordinates;
    // Check if coordinates have at least 2 points
    if (!Array.isArray(coords) || coords.length < 2) return;

    const properties = feature.properties || {};

    // 1. Match Link Name & Identifier
    const rawId = getPropertyByKeys(properties, ['Pipe_ID', 'PipeID', 'id', 'link_id', 'linkid', 'objectid', 'Name']);
    const id = rawId ? String(rawId).trim() : `P-Import-${idx + 1}-${uuidv4().substring(0, 5)}`;
    const linkName = getPropertyByKeys(properties, ['Name', 'Pipe_ID', 'name', 'label', 'code']) || id;

    // 2. Parse Diameter and Shape
    const diameter = parseDiameter(getPropertyByKeys(properties, ['Diameter', 'diameter', 'Dia', 'dia', 'Size', 'size', 'width', 'Width']));
    
    // 3. Compute length with Turf.js. If missing, auto re-compute.
    let length = parseFloat(getPropertyByKeys(properties, ['Length', 'length', 'len', 'Len', 'L_meters']));
    if (isNaN(length) || length <= 0) {
      try {
        const lineFeature = turf.lineString(coords);
        // Turf returns length in kilometers; convert to meters
        length = Number((turf.length(lineFeature, { units: 'kilometers' }) * 1000).toFixed(2));
      } catch (err) {
        // Precise Haversine fallback on vertex segments
        let segmentSum = 0;
        for (let j = 0; j < coords.length - 1; j++) {
          segmentSum += calculateGeodeticDistance(coords[j][1], coords[j][0], coords[j+1][1], coords[j+1][0]);
        }
        length = Number(segmentSum.toFixed(2));
      }
    }

    // 4. Spatial topological search (First point and Last point of the LineString coordinates)
    const startCoord = coords[0]; // [lng, lat]
    const endCoord = coords[coords.length - 1]; // [lng, lat]

    let sourceNodeId = '';
    let targetNodeId = '';

    const toleranceMeters = 0.2; // Spatial tolerance threshold is 0.2 meters

    // Search existing nodes
    let minStartDist = Infinity;
    let minEndDist = Infinity;
    let nearestStartNode: EnhancedNode | null = null;
    let nearestEndNode: EnhancedNode | null = null;

    // Pool all nodes (current storage nodes + newly healed in current loop iteration)
    const totalNodesSearchPool = [...currentNodes, ...newlyCreatedNodes];

    totalNodesSearchPool.forEach(n => {
      const distStart = calculateGeodeticDistance(startCoord[1], startCoord[0], n.lat, n.lng);
      if (distStart < minStartDist) {
        minStartDist = distStart;
        nearestStartNode = n;
      }

      const distEnd = calculateGeodeticDistance(endCoord[1], endCoord[0], n.lat, n.lng);
      if (distEnd < minEndDist) {
        minEndDist = distEnd;
        nearestEndNode = n;
      }
    });

    // Resolve or Auto-Heal (self-create) source node
    if (nearestStartNode && minStartDist <= toleranceMeters) {
      sourceNodeId = nearestStartNode.id;
    } else {
      // If no checkwell falls within the 0.2m threshold, dynamically spawn a node
      const autoId = `MH-AutoNode-${uuidv4().substring(0, 5)}`;
      const autoNode: EnhancedNode = {
        id: autoId,
        name: `MH-(Auto-${autoId.substring(12)})`,
        type: 'manhole',
        lat: startCoord[1],
        lng: startCoord[0],
        x: startCoord[0],
        y: startCoord[1],
        elevation: 100, // default placeholder elements
        bottomElevation: 100,
        groundElevation: 102.5,
        maxDepth: 2.5,
        waterLevel: 0,
        overflowRate: 0
      };
      newlyCreatedNodes.push(autoNode);
      sourceNodeId = autoId;
      console.log(`[GisDataImporter] Spatial Autocomplete: Created missing source Node at ${startCoord} for Link ${id}`);
    }

    // Resolve or Auto-Heal target node
    if (nearestEndNode && minEndDist <= toleranceMeters) {
      targetNodeId = nearestEndNode.id;
    } else {
      const autoId = `MH-AutoNode-${uuidv4().substring(0, 5)}`;
      const autoNode: EnhancedNode = {
        id: autoId,
        name: `MH-(Auto-${autoId.substring(12)})`,
        type: 'manhole',
        lat: endCoord[1],
        lng: endCoord[0],
        x: endCoord[0],
        y: endCoord[1],
        elevation: 99.5, // slightly lower slope fallback
        bottomElevation: 99.5,
        groundElevation: 102.0,
        maxDepth: 2.5,
        waterLevel: 0,
        overflowRate: 0
      };
      newlyCreatedNodes.push(autoNode);
      targetNodeId = autoId;
      console.log(`[GisDataImporter] Spatial Autocomplete: Created missing target Node at ${endCoord} for Link ${id}`);
    }

    // 5. Build Conduit item with physical slope calculation
    const sourceNodeObj = [...currentNodes, ...newlyCreatedNodes].find(n => n.id === sourceNodeId);
    const targetNodeObj = [...currentNodes, ...newlyCreatedNodes].find(n => n.id === targetNodeId);
    let slope = 0.002; // default standard pipe slope
    if (sourceNodeObj && targetNodeObj) {
      const heightDiff = sourceNodeObj.bottomElevation - targetNodeObj.bottomElevation;
      slope = Number((heightDiff / length).toFixed(5));
      if (slope < 0) {
        // Prevent flat or adverse slope logic breaking: align down flow
        slope = 0.001; 
      }
    }

    const parsedLink: EnhancedLink = {
      id,
      name: String(linkName),
      fromNodeId: sourceNodeId,
      toNodeId: targetNodeId,
      source: sourceNodeId,
      target: targetNodeId,
      length,
      diameter,
      height: diameter, // Square bounding height identical for simple circular model
      shape: 'circular',
      material: 'Concrete',
      roughness: 0.013, // Concrete standard roughness coefficient
      slope
    };

    importedLinks.push(parsedLink);
  });

  if (importedLinks.length > 0 || newlyCreatedNodes.length > 0) {
    store.pushHistory();

    const currentLinks = store.links;
    const mergedLinksMap = new Map<string, EnhancedLink>();
    currentLinks.forEach(l => mergedLinksMap.set(l.id.toLowerCase(), l));
    importedLinks.forEach(l => mergedLinksMap.set(l.id.toLowerCase(), l));

    // Save newly created healed nodes to the Store too!
    const finalNodes = [...store.nodes, ...newlyCreatedNodes];
    const finalLinks = Array.from(mergedLinksMap.values());

    usePipelineStore.setState({ 
      nodes: finalNodes,
      links: finalLinks 
    });

    console.log(`[GisDataImporter] Links Import Summary: Integrated ${importedLinks.length} pipes. Replaced/Inserted ${newlyCreatedNodes.length} complementary helper nodes.`);
  }

  return importedLinks;
}

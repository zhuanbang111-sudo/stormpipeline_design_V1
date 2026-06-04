import { Delaunay } from 'd3-delaunay';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import { EnhancedNode, EnhancedLink, EnhancedCatchment } from '../store/usePipelineStore';

/**
 * Recalculate planar area of a lat-lng polygon in hectares
 */
export function calculatePolygonArea(vertices: [number, number][]): number {
  if (vertices.length < 3) return 0;
  try {
    // Standard turf.js area calculation
    // Converts [lat, lng] to [lng, lat]
    const closed = [...vertices];
    if (closed[0][0] !== closed[closed.length - 1][0] || closed[0][1] !== closed[closed.length - 1][1]) {
      closed.push(closed[0]);
    }
    const turfPoly = turf.polygon([closed.map(pt => [pt[1], pt[0]])]);
    const areaSquareMeters = turf.area(turfPoly);
    const hectares = areaSquareMeters / 10000;
    return Number(hectares.toFixed(2));
  } catch (err) {
    console.warn("Calculating area failed, using fallback:", err);
    return 0.5; // fallback
  }
}

/**
 * Generate Voronoi cell boundaries as basic catchments for a set of nodes
 */
export function generateVoronoiGrid(nodes: EnhancedNode[]): EnhancedCatchment[] {
  const targetNodes = nodes.filter(n => n.type === 'manhole');
  if (targetNodes.length < 3) {
    throw new Error('需要至少 3 个检查井（Manhole）进行泰森多边形几何剖分！');
  }

  // To prevent coordinates layout degeneration, add microscopic jitter
  const points = targetNodes.map(n => [
    n.lng + (Math.random() - 0.5) * 1e-9,
    n.lat + (Math.random() - 0.5) * 1e-9
  ] as [number, number]);

  const lats = targetNodes.map(n => n.lat);
  const lngs = targetNodes.map(n => n.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Buffer safe boundaries
  const latMargin = Math.max(0.005, (maxLat - minLat) * 0.4);
  const lngMargin = Math.max(0.005, (maxLng - minLng) * 0.4);

  const bounds = [
    minLng - lngMargin,
    minLat - latMargin,
    maxLng + lngMargin,
    maxLat + latMargin
  ] as [number, number, number, number];

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi(bounds);

  const list: EnhancedCatchment[] = [];
  targetNodes.forEach((node, i) => {
    const cell = voronoi.cellPolygon(i);
    if (cell && cell.length >= 3) {
      // Map back to [lat, lng] array
      const vertices: [number, number][] = cell.map(pt => [pt[1], pt[0]]);
      const area = calculatePolygonArea(vertices);

      list.push({
        id: uuidv4(),
        name: `C-${node.name}`,
        area,
        runOffCoef: 0.8,
        runoffCoefficient: 0.8,
        timeOfConcentration: 10,
        nodeCtx: node.id,
        outletNodeId: node.id,
        polygon: vertices,
        polygonVertices: vertices
      });
    }
  });

  return list;
}

/**
 * Build directed acyclic graph (DAG) and track all upstream connected nodes of a specific target link
 */
export function getUpstreamNodes(
  links: EnhancedLink[],
  startNodeId: string
): Set<string> {
  const upstream = new Set<string>();
  const visited = new Set<string>();

  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    // Look for links that flow into this node (target === nodeId)
    const inbound = links.filter(l => l.target === nodeId);
    inbound.forEach(link => {
      upstream.add(link.source);
      traverse(link.source);
    });
  }

  traverse(startNodeId);
  return upstream;
}

/**
 * Merge base catchments for selected link's upstream nodes using turf.union
 */
export function groupUpstreamCatchments(
  nodes: EnhancedNode[],
  links: EnhancedLink[],
  catchments: EnhancedCatchment[],
  activeLinkId: string
): { mergedVertices: [number, number][][]; totalArea: number } | null {
  const link = links.find(l => l.id === activeLinkId);
  if (!link) return null;

  // We want to combine the catchment connected to the start node (source)
  // and all nodes that are hydrologically upstream (flowing into current link's source node)
  const connectedNodeIds = getUpstreamNodes(links, link.source);
  connectedNodeIds.add(link.source); // add the upstream node of this pipe itself

  // Find their respective catchments
  const targetCatchments = catchments.filter(c => c.nodeCtx && connectedNodeIds.has(c.nodeCtx));
  if (targetCatchments.length === 0) return null;

  try {
    // Form turf polygons
    const turfPolygons = targetCatchments.map(c => {
      // GeoJSON requires closed polygon loops with coordinate sequence: [lng, lat]
      const outerRing = [...c.polygonVertices];
      if (
        outerRing[0][0] !== outerRing[outerRing.length - 1][0] ||
        outerRing[0][1] !== outerRing[outerRing.length - 1][1]
      ) {
        outerRing.push(outerRing[0]);
      }
      return turf.polygon([outerRing.map(pt => [pt[1], pt[0]])]);
    });

    if (turfPolygons.length === 1) {
      const vertices = targetCatchments[0].polygonVertices;
      const totalArea = targetCatchments[0].area;
      return { mergedVertices: [vertices], totalArea };
    }

    // Merge polygons using turf.union
    const fc = turf.featureCollection(turfPolygons);
    const unioned = turf.union(fc);

    if (!unioned || !unioned.geometry) return null;

    // Convert unioned geometry coordinate rings back to [lat, lng][][] for Leaflet and storage
    const ringsList: [number, number][][] = [];
    const geomType = unioned.geometry.type;

    if (geomType === 'Polygon') {
      const coords = unioned.geometry.coordinates as number[][][];
      coords.forEach(ring => {
        ringsList.push(ring.map(pt => [pt[1], pt[0]]));
      });
    } else if (geomType === 'MultiPolygon') {
      const multipoly = unioned.geometry.coordinates as number[][][][];
      multipoly.forEach(poly => {
        poly.forEach(ring => {
          ringsList.push(ring.map(pt => [pt[1], pt[0]]));
        });
      });
    }

    // Calculate total area in hectares
    const areaSquareMeters = turf.area(unioned);
    const totalArea = Number((areaSquareMeters / 10000).toFixed(2));

    return {
      mergedVertices: ringsList,
      totalArea
    };
  } catch (err) {
    console.error("Merging catchments failed, fallback:", err);
    // Return concatenated points or sum area as safe fallback
    const sumArea = targetCatchments.reduce((acc, c) => acc + c.area, 0);
    return {
      mergedVertices: targetCatchments.map(c => c.polygonVertices),
      totalArea: sumArea
    };
  }
}

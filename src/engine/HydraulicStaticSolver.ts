import { EnhancedNode, EnhancedLink, EnhancedCatchment } from '../store/usePipelineStore';

export interface StormFormulaParams {
  A1: number; // typical rainfall coefficient (similar to Shanghai/Shenzhen parameters)
  C: number;  // return period parameter
  b: number;  // time constant (minutes)
  n: number;  // decay index
}

export interface SolverResult {
  nodeWaterLevels: Record<string, number>; // node ID -> waterLevel
  nodeOverflowRates: Record<string, number>; // node ID -> overflowRate (m3/s)
  linkFlows: Record<string, number>; // link ID -> current flow (m3/s)
  linkCapacities: Record<string, number>; // link ID -> max capacity (m3/s)
  linkVelocities: Record<string, number>; // link ID -> flow velocity (m/s)
  linkOverflowStatus: Record<string, boolean>; // link ID -> overflow risk
}

/**
 * Standard storm intensity formula: q = 167 * A1 * (1 + C * lg(P)) / (t + b)^n
 * Returns q in L/(s * ha)
 * If we need custom parameters, they are handled. Or we map formulaParams (e.g. A = 167 * A1)
 */
export function calculateStormIntensity(
  P: number,
  t: number,
  params: StormFormulaParams
): number {
  const numerator = 167 * params.A1 * (1 + params.C * Math.log10(P));
  const denominator = Math.pow(t + params.b, params.n);
  return numerator / Math.max(0.1, denominator);
}

/**
 * Solves steady-state hydraulics for storm networks using rainfall-runoff and standard Manning formula.
 * Ref: GB50014 outdoor design standards and Manning flow equation.
 */
export function solveHydraulics(
  nodes: EnhancedNode[],
  links: EnhancedLink[],
  catchments: EnhancedCatchment[],
  returnPeriod: number,
  rainfallDuration: number, // minutes
  formulaParams: StormFormulaParams,
  manningN: number = 0.013
): SolverResult {
  const nodeWaterLevels: Record<string, number> = {};
  const nodeOverflowRates: Record<string, number> = {};
  const linkFlows: Record<string, number> = {};
  const linkCapacities: Record<string, number> = {};
  const linkVelocities: Record<string, number> = {};
  const linkOverflowStatus: Record<string, boolean> = {};

  // Initialize nodes
  nodes.forEach(node => {
    nodeWaterLevels[node.id] = 0;
    nodeOverflowRates[node.id] = 0;
  });

  // Calculate local storm intensity q in L/(s*ha)
  const qIntensity = calculateStormIntensity(returnPeriod, rainfallDuration, formulaParams);

  // 1. Calculate each catchment's local runoff generation: Q_runoff = qIntensity * Area * runOffCoef
  // Convert L/s to m3/s: divide by 1000
  const catchmentRunoffs: Record<string, number> = {}; // catchment ID -> runoff in m3/s
  catchments.forEach(c => {
    const runoffLps = qIntensity * c.area * c.runOffCoef;
    catchmentRunoffs[c.id] = runoffLps / 1000;
  });

  // 2. Perform Topology Sorting using Kahn's algorithm (directed graph sorting from upstream to downstream)
  const inDegree: Record<string, number> = {};
  const adj: Record<string, EnhancedLink[]> = {};

  nodes.forEach(n => {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  });

  links.forEach(l => {
    if (adj[l.source]) {
      adj[l.source].push(l);
    }
    if (inDegree[l.target] !== undefined) {
      inDegree[l.target]++;
    }
  });

  // Entry points (source nodes with 0 in-degree)
  const queue: string[] = [];
  nodes.forEach(n => {
    if (inDegree[n.id] === 0) {
      queue.push(n.id);
    }
  });

  const sortedNodeIds: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    sortedNodeIds.push(currentId);

    const outLinks = adj[currentId] || [];
    outLinks.forEach(link => {
      const targetId = link.target;
      if (inDegree[targetId] !== undefined) {
        inDegree[targetId]--;
        if (inDegree[targetId] === 0) {
          queue.push(targetId);
        }
      }
    });
  }

  // Fallback: If loops exist or nodes are remaining due to drawing circles, append them
  if (sortedNodeIds.length < nodes.length) {
    nodes.forEach(n => {
      if (!sortedNodeIds.includes(n.id)) {
        sortedNodeIds.push(n.id);
      }
    });
  }

  // 3. High-efficiency downstream flow routing
  // Track node inflows: ID -> total flow in m3/s
  const nodeTotalInflows: Record<string, number> = {};
  nodes.forEach(n => {
    nodeTotalInflows[n.id] = 0;
  });

  // Add catchment direct runoffs to corresponding local node ctx
  catchments.forEach(c => {
    if (c.nodeCtx && nodeTotalInflows[c.nodeCtx] !== undefined) {
      nodeTotalInflows[c.nodeCtx] += catchmentRunoffs[c.id] || 0;
    }
  });

  // Evaluate links and accumulate to downstream nodes in topological order
  sortedNodeIds.forEach(nodeId => {
    const currentTotalInflow = nodeTotalInflows[nodeId];
    
    // Find outbound links
    const outLinks = links.filter(l => l.source === nodeId);
    if (outLinks.length === 0) return;

    // Distribute total inflow equally among outgoing links (typically 1 for drains, but support splits gracefully)
    const flowPerOutgoingLink = currentTotalInflow / outLinks.length;

    outLinks.forEach(link => {
      // Fetch nodes to evaluate slope / properties
      const fromNode = nodes.find(n => n.id === link.source);
      const toNode = nodes.find(n => n.id === link.target);

      // Hydraulic calculations for circular pipe (Manning formula)
      const dInMeters = link.diameter / 1000;
      const pipeArea = (Math.PI * Math.pow(dInMeters, 2)) / 4;
      const hydraulicRadius = dInMeters / 4; // full full flow
      
      // Compute actual slope
      let slope = 0.001; // fallback
      if (fromNode && toNode && link.length > 0) {
        const fall = fromNode.bottomElevation - toNode.bottomElevation;
        slope = Math.max(0.0001, fall / link.length); // minimum physical slope guard
      }

      const roughness = link.roughness || manningN;
      
      // Manning flow velocity (v = (1/n) * R^(2/3) * I^(1/2))
      const velocity = (1 / roughness) * Math.pow(hydraulicRadius, 2 / 3) * Math.pow(slope, 0.5);
      // Full flow carrying capacity (Q_cap = Area * velocity)
      const qCap = pipeArea * velocity;

      // Assign results
      linkCapacities[link.id] = qCap;
      linkFlows[link.id] = flowPerOutgoingLink;
      linkVelocities[link.id] = flowPerOutgoingLink > 0 ? Math.min(velocity, flowPerOutgoingLink / pipeArea) : 0;
      
      // Check overload risk
      const isOverflowing = flowPerOutgoingLink > qCap;
      linkOverflowStatus[link.id] = isOverflowing;

      let linkDeliveryFlow = flowPerOutgoingLink;
      if (isOverflowing) {
        // Discharged over-capacity is lost as surface flooding / spill at the upstream node
        const spilledFlow = flowPerOutgoingLink - qCap;
        nodeOverflowRates[link.source] += spilledFlow; // Add spill to node's overflowRate
        
        // Only Q_cap is actually carried downstream in full pipe
        linkDeliveryFlow = qCap;
        linkVelocities[link.id] = velocity; // Max physical velocity reached
      }

      // Deliver flow downstream
      if (nodeTotalInflows[link.target] !== undefined) {
        nodeTotalInflows[link.target] += linkDeliveryFlow;
      }
    });
  });

  // 4. Update Node Water Levels (H = BottomElev + waterDepth)
  nodes.forEach(node => {
    const inflow = nodeTotalInflows[node.id];
    const outLinks = links.filter(l => l.source === node.id);
    const sumOutCap = outLinks.reduce((acc, l) => acc + (linkCapacities[l.id] || 0.1), 0);
    
    let depth = 0;
    if (sumOutCap > 0 && inflow > 0) {
      depth = Math.min(node.maxDepth, (inflow / sumOutCap) * (node.maxDepth * 0.8));
    } else if (inflow > 0 && node.type === 'manhole') {
      depth = node.maxDepth; // filled up
    }

    nodeWaterLevels[node.id] = node.bottomElevation + depth;
  });

  return {
    nodeWaterLevels,
    nodeOverflowRates,
    linkFlows,
    linkCapacities,
    linkVelocities,
    linkOverflowStatus,
  };
}

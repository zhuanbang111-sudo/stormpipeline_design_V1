import { EnhancedNode, EnhancedLink, EnhancedCatchment } from '../store/usePipelineStore';

export interface SanityAnomaly {
  id: string;
  linkId: string;
  type: 'shrinkage_warning' | 'shrinkage_error' | 'reversed_draw';
  severity: 'warning' | 'error';
  title: string;
  description: string;
  upstreamLinkId?: string;
  upstreamLinkName?: string;
  downstreamLinkName: string;
  metrics: {
    upstreamDiameter: number;
    downstreamDiameter: number;
    upstreamSlope: number;
    downstreamSlope: number;
    actualFlow: number; // m3/s
    capacityDownstream: number; // m3/s
    upGroundElev?: number;
    downGroundElev?: number;
    upBottomElev?: number;
    downBottomElev?: number;
  };
}

/**
 * Robust Manning flow calculation helper
 * Returns full-capacity flow (Q_cap) in m3/s
 */
export function calculateManningCapacity(diameterMm: number, slope: number, roughness: number = 0.013): { capacity: number; velocity: number } {
  const dMeters = diameterMm / 1000;
  const area = (Math.PI * Math.pow(dMeters, 2)) / 4;
  const R = dMeters / 4; // Full-flow hydraulic radius
  const sClamped = Math.max(0.0001, slope);
  
  // Manning equation: v = (1 / n) * R^(2/3) * S^(1/2)
  const velocity = (1 / roughness) * Math.pow(R, 2 / 3) * Math.pow(sClamped, 0.5);
  const capacity = area * velocity;
  return { capacity, velocity };
}

/**
 * Core check engine analyzing pipe diameter shrinkage, flow routing accumulation,
 * and reversed-draw GIS connectivity.
 */
export function checkShrinkageAnomaly(
  nodes: EnhancedNode[],
  links: EnhancedLink[],
  catchments: EnhancedCatchment[],
  simulationParams?: any
): SanityAnomaly[] {
  const anomalies: SanityAnomaly[] = [];
  if (links.length === 0 || nodes.length === 0) return anomalies;

  // 1. Core topological sorting to compute local actual flows (Q_actual)
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

  // Fallback sorting
  if (sortedNodeIds.length < nodes.length) {
    nodes.forEach(n => {
      if (!sortedNodeIds.includes(n.id)) {
        sortedNodeIds.push(n.id);
      }
    });
  }

  // Calculate local storm intensity fallback
  // Q = q * F * psi
  // Let's assume standard q = 150 L/(s * ha) to accumulate Q_runoff
  const qIntensity = 150; // L/s/ha
  const catchmentRunoffs: Record<string, number> = {};
  catchments.forEach(c => {
    catchmentRunoffs[c.id] = (qIntensity * c.area * (c.runOffCoef || 0.65)) / 1000; // m3/s
  });

  // Track flows
  const nodeTotalInflows: Record<string, number> = {};
  nodes.forEach(n => {
    nodeTotalInflows[n.id] = 0;
  });

  catchments.forEach(c => {
    const targetNode = c.nodeCtx || c.outletNodeId;
    if (targetNode && nodeTotalInflows[targetNode] !== undefined) {
      nodeTotalInflows[targetNode] += catchmentRunoffs[c.id] || 0;
    }
  });

  const linkFlows: Record<string, number> = {};

  sortedNodeIds.forEach(nodeId => {
    const currentTotalInflow = nodeTotalInflows[nodeId];
    const outLinks = links.filter(l => l.source === nodeId);
    if (outLinks.length === 0) return;

    const flowPerOutgoingLink = currentTotalInflow / outLinks.length;

    outLinks.forEach(link => {
      const fromNode = nodes.find(n => n.id === link.source);
      const toNode = nodes.find(n => n.id === link.target);

      let slope = 0.001;
      if (fromNode && toNode && link.length > 0) {
        const fall = fromNode.bottomElevation - toNode.bottomElevation;
        slope = Math.max(0.0001, fall / link.length);
      }

      const capacityResult = calculateManningCapacity(link.diameter, slope, link.roughness || 0.013);
      linkFlows[link.id] = flowPerOutgoingLink;

      // Deliver flow to downstream target node
      const linkDeliveryFlow = Math.min(flowPerOutgoingLink, capacityResult.capacity);
      if (nodeTotalInflows[link.target] !== undefined) {
        nodeTotalInflows[link.target] += linkDeliveryFlow;
      }
    });
  });

  // 2. Traversal of all adjacent links to check for shrinkage anomalies and draw reverse checks
  links.forEach(downstreamLink => {
    const startNode = nodes.find(n => n.id === downstreamLink.source);
    const endNode = nodes.find(n => n.id === downstreamLink.target);
    if (!startNode || !endNode) return;

    // Upstream pipelines connected into downstreamLink.source
    const upstreamLinks = links.filter(l => l.target === downstreamLink.source);

    upstreamLinks.forEach(upstreamLink => {
      // If we observe pipe diameter shrinkage: downstream < upstream
      if (downstreamLink.diameter < upstreamLink.diameter) {
        const upStartNode = nodes.find(n => n.id === upstreamLink.source);
        const upEndNode = nodes.find(n => n.id === upstreamLink.target);
        
        let I_up = 0.001;
        if (upStartNode && upEndNode && upstreamLink.length > 0) {
          I_up = Math.max(0.0001, (upStartNode.bottomElevation - upEndNode.bottomElevation) / upstreamLink.length);
        }

        let I_down = 0.001;
        if (startNode && endNode && downstreamLink.length > 0) {
          I_down = Math.max(0.0001, (startNode.bottomElevation - endNode.bottomElevation) / downstreamLink.length);
        }

        // Q_actual represents accumulated flow entering downstreamLink
        const Q_actual = linkFlows[downstreamLink.id] || 0.05; // default fallback if empty
        const { capacity: Q_cap_down } = calculateManningCapacity(downstreamLink.diameter, I_down, downstreamLink.roughness || 0.013);

        const isReasonableBySlope = Q_cap_down >= Q_actual;

        // Perform space direction inversion check
        // If downstream ground elevation is significantly higher than upstream ground elevation, they drew in reverse direction!
        const isReversedDraw = endNode.groundElevation > startNode.groundElevation + 0.1;

        if (isReversedDraw) {
          anomalies.push({
            id: `reversed-${downstreamLink.id}-${upstreamLink.id}`,
            linkId: downstreamLink.id,
            type: 'reversed_draw',
            severity: 'error',
            title: '空间流向严重逆流异常 (Reversed Slope/Draw direction error)',
            description: `管段 [${downstreamLink.name}] 下游节点地面高程明显高于上游节点（下游 ${endNode.groundElevation}m > 上游 ${startNode.groundElevation}m），判定为鼠标画图方向反了。`,
            upstreamLinkId: upstreamLink.id,
            upstreamLinkName: upstreamLink.name,
            downstreamLinkName: downstreamLink.name,
            metrics: {
              upstreamDiameter: upstreamLink.diameter,
              downstreamDiameter: downstreamLink.diameter,
              upstreamSlope: I_up,
              downstreamSlope: I_down,
              actualFlow: Q_actual,
              capacityDownstream: Q_cap_down,
              upGroundElev: startNode.groundElevation,
              downGroundElev: endNode.groundElevation,
              upBottomElev: startNode.bottomElevation,
              downBottomElev: endNode.bottomElevation
            }
          });
        } else {
          // If not reversed, let's categorize based on capacity
          if (isReasonableBySlope) {
            anomalies.push({
              id: `shrink-warn-${downstreamLink.id}-${upstreamLink.id}`,
              linkId: downstreamLink.id,
              type: 'shrinkage_warning',
              severity: 'warning',
              title: '自适应陡坡物理缩径 (Rational Steep-Slope Narrowing)',
              description: `下游管段缩径（${upstreamLink.diameter}mm → ${downstreamLink.diameter}mm），但因下游坡度变陡（${(I_down*1000).toFixed(1)}‰），满流排泄能力 Q = ${Q_cap_down.toFixed(3)} m³/s，能够完全负荷上游汇集流量 Q = ${Q_actual.toFixed(3)} m³/s，属于符合规范的良性设计。`,
              upstreamLinkId: upstreamLink.id,
              upstreamLinkName: upstreamLink.name,
              downstreamLinkName: downstreamLink.name,
              metrics: {
                upstreamDiameter: upstreamLink.diameter,
                downstreamDiameter: downstreamLink.diameter,
                upstreamSlope: I_up,
                downstreamSlope: I_down,
                actualFlow: Q_actual,
                capacityDownstream: Q_cap_down,
                upGroundElev: startNode.groundElevation,
                downGroundElev: endNode.groundElevation,
                upBottomElev: startNode.bottomElevation,
                downBottomElev: endNode.bottomElevation
              }
            });
          } else {
            anomalies.push({
              id: `shrink-err-${downstreamLink.id}-${upstreamLink.id}`,
              linkId: downstreamLink.id,
              type: 'shrinkage_error',
              severity: 'error',
              title: '严重级缩径瓶颈卡脖子工况 (Severe Constricting Bottleneck)',
              description: `管段 [${downstreamLink.name}] 管径显著缩水（${upstreamLink.diameter}mm → ${downstreamLink.diameter}mm）。下游最高排涝流量仅有 ${Q_cap_down.toFixed(3)} m³/s，无法满足上游累积而来的 ${Q_actual.toFixed(3)} m³/s 实测过流流量压力，产生严重堵塞反冲风险。`,
              upstreamLinkId: upstreamLink.id,
              upstreamLinkName: upstreamLink.name,
              downstreamLinkName: downstreamLink.name,
              metrics: {
                upstreamDiameter: upstreamLink.diameter,
                downstreamDiameter: downstreamLink.diameter,
                upstreamSlope: I_up,
                downstreamSlope: I_down,
                actualFlow: Q_actual,
                capacityDownstream: Q_cap_down,
                upGroundElev: startNode.groundElevation,
                downGroundElev: endNode.groundElevation,
                upBottomElev: startNode.bottomElevation,
                downBottomElev: endNode.bottomElevation
              }
            });
          }
        }
      }
    });
  });

  return anomalies;
}

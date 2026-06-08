import { Node, Link, Catchment } from '../types';
import { SimulationParams } from '../engine/hydraulicEngine';

/**
 * Generates an EPA-SWMM standard .inp input deck from current pipe network GIS features.
 */
export function generateSwmmInpText(
  nodes: Node[],
  links: Link[],
  catchments: Catchment[],
  params: SimulationParams
): string {
  const lines: string[] = [];

  // 1. TITLE
  lines.push('[TITLE]');
  lines.push('AI Studio Smart Drain Digital Twin - Auto-assembled SWMM Model Input File');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Routing Method: ${params.routingMethod}`);
  lines.push('');

  // 2. OPTIONS
  lines.push('[OPTIONS]');
  lines.push('FLOW_UNITS           LPS');
  lines.push('INFILTRATION         HORTON');
  lines.push('FLOW_ROUTING         DYNAMICWAVE');
  lines.push('LINK_OFFSETS         DEPTH');
  lines.push('MIN_SLOPE            0.0001');
  lines.push('ALLOW_PONDING        YES');
  lines.push('SKIP_STEADY_STATE    NO');
  lines.push('START_DATE           06/06/2026');
  lines.push('START_TIME           00:00:00');
  lines.push('REPORT_START_DATE    06/06/2026');
  lines.push('REPORT_START_TIME    00:00:00');
  
  // Calculate end time format based on stormDuration
  const durationHrs = Math.max(1, Math.ceil((params.stormDuration + 60) / 60));
  const endTimeStr = durationHrs < 10 ? `0${durationHrs}:00:00` : `${durationHrs}:00:00`;
  lines.push(`END_DATE             06/06/2026`);
  lines.push(`END_TIME             ${endTimeStr}`);
  
  lines.push('SWEEP_START          01/01');
  lines.push('SWEEP_END            12/31');
  lines.push('DRY_STEP             01:00:00');
  lines.push('WET_STEP             00:05:00');
  lines.push('FLOW_STEP            00:00:15');
  lines.push('SPURT_STEP           00:01:00');
  lines.push('REPORT_STEP          00:02:00');
  lines.push('SYS_FLOW_TOL         5');
  lines.push('LAT_FLOW_TOL         5');
  lines.push('');

  // 3. EVAPORATION
  lines.push('[EVAPORATION]');
  lines.push('CONSTANT             0.0');
  lines.push('');

  // 4. JUNCTIONS
  lines.push('[JUNCTIONS]');
  lines.push(';;Name           Elevation  MaxDepth   InitDepth  SurDepth   Aponded   ');
  lines.push(';;-------------- ---------- ---------- ---------- ---------- ----------');
  nodes.filter(n => n.type !== 'outfall').forEach(n => {
    const elev = n.elevation !== undefined ? n.elevation.toFixed(3) : '10.000';
    const maxDepth = n.maxDepth !== undefined ? n.maxDepth.toFixed(3) : '3.000';
    lines.push(`${n.name.padEnd(16)} ${elev.padEnd(10)} ${maxDepth.padEnd(10)} 0.000      0.000      0.000`);
  });
  lines.push('');

  // 5. OUTFALLS
  lines.push('[OUTFALLS]');
  lines.push(';;Name           Elevation  Type       Stage Data       Gated    Route To        ');
  lines.push(';;-------------- ---------- ---------- ---------------- -------- ----------------');
  nodes.filter(n => n.type === 'outfall').forEach(n => {
    const elev = n.elevation !== undefined ? n.elevation.toFixed(3) : '9.000';
    lines.push(`${n.name.padEnd(16)} ${elev.padEnd(10)} FREE       ""               NO`);
  });
  lines.push('');

  // 6. CONDUITS
  lines.push('[CONDUITS]');
  lines.push(';;Name           From Node        To Node          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow   ');
  lines.push(';;-------------- ---------------- ---------------- ---------- ---------- ---------- ---------- ---------- ----------');
  links.forEach(l => {
    const fromNode = nodes.find(n => n.id === l.fromNodeId || n.id === l.source);
    const toNode = nodes.find(n => n.id === l.toNodeId || n.id === l.target);
    const fromName = fromNode ? fromNode.name : 'Unknown';
    const toName = toNode ? toNode.name : 'Unknown';
    const length = l.length !== undefined ? l.length.toFixed(1) : '100.0';
    const roughness = l.roughness !== undefined ? l.roughness.toFixed(4) : '0.0130';
    lines.push(`${l.name.padEnd(16)} ${fromName.padEnd(16)} ${toName.padEnd(16)} ${length.padEnd(10)} ${roughness.padEnd(10)} 0.0000     0.0000     0.0000     0.0000`);
  });
  lines.push('');

  // 7. XSECTIONS
  lines.push('[XSECTIONS]');
  lines.push(';;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels    Culvert   ');
  lines.push(';;-------------- ---------- ---------- ---------- ---------- ---------- ---------- ----------');
  links.forEach(l => {
    const geom1 = ((l.diameter || 300) / 1000).toFixed(3); // Circular diameter in meters
    lines.push(`${l.name.padEnd(16)} CIRCULAR   ${geom1.padEnd(10)} 0.0000     0.0000     0.0000     1          0`);
  });
  lines.push('');

  // 8. SUBCATCHMENTS
  lines.push('[SUBCATCHMENTS]');
  lines.push(';;Name           Area     Width    Slope    Imperv   Outlet          ');
  lines.push(';;-------------- -------- -------- -------- -------- ----------------');
  catchments.forEach(c => {
    const outletNode = nodes.find(n => n.id === c.outletNodeId);
    const outletName = outletNode ? outletNode.name : 'Unknown';
    const area = c.area !== undefined ? c.area.toFixed(3) : '1.000';
    const imperv = ((c.runoffCoefficient || 0.8) * 100).toFixed(1);
    lines.push(`${c.name.padEnd(16)} ${area.padEnd(8)} 100      0.5      ${imperv.padEnd(8)} ${outletName}`);
  });
  lines.push('');

  // 9. SUBAREAS
  lines.push('[SUBAREAS]');
  lines.push(';;Subcatchment   N-Imperv   N-Perv     S-Imperv   S-Perv     PctZero    RouteTo    PctRouted ');
  lines.push(';;-------------- ---------- ---------- ---------- ---------- ---------- ---------- ----------');
  catchments.forEach(c => {
    lines.push(`${c.name.padEnd(16)} 0.013      0.150      0.050      0.100      20         OUTLET`);
  });
  lines.push('');

  // 10. INFILTRATION (using Horton standard specs)
  lines.push('[INFILTRATION]');
  lines.push(';;Subcatchment   MaxRate    MinRate    Decay      DryTime    MaxInfil  ');
  lines.push(';;-------------- ---------- ---------- ---------- ---------- ----------');
  catchments.forEach(c => {
    lines.push(`${c.name.padEnd(16)} 76.2       12.7       4.1        7          0.0`);
  });
  lines.push('');

  // 11. COORDINATES
  lines.push('[COORDINATES]');
  lines.push(';;Node           X-Coord            Y-Coord           ');
  lines.push(';;-------------- ------------------ ------------------');
  nodes.forEach(n => {
    lines.push(`${n.name.padEnd(16)} ${n.lng.toFixed(6).padEnd(18)} ${n.lat.toFixed(6).padEnd(18)}`);
  });
  lines.push('');

  lines.push('[VERTICES]');
  lines.push(';;Link           X-Coord            Y-Coord           ');
  lines.push(';;-------------- ------------------ ------------------');
  lines.push('');

  return lines.join('\n');
}

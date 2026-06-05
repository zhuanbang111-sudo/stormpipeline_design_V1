/**
 * SWMM Report file (.rpt) parser utility
 * Highly efficient regular expression matching & tabular scanner for EPA-SWMM simulation reports.
 * 精密解析 SWMM 报告中的 Node Flooding Summary, Node Inflow Summary 和 Link Flow Summary 关键指标。
 */

export interface ParsedRptNode {
  name: string;
  type: string;
  maxFloodingFlow?: number;       // from Node Flooding Summary
  totalFloodingVolume?: number;   // from Node Flooding Summary (Volume Flooded)
  maxPondedDepth?: number;        // from Node Flooding Summary
  maxInflow?: number;             // from Node Inflow Summary
  totalInflowVolume?: number;     // from Node Inflow Summary
  lateralInflowVolume?: number;   // from Node Inflow Summary
}

export interface ParsedRptLink {
  name: string;
  type: string;
  maxFlow: number;                // from Link Flow Summary (L/s or m3/s)
  maxVelocity: number;            // from Link Flow Summary (m/s or ft/s)
  maxFullFlowRatio: number;       // from Link Flow Summary (Max/Full Flow)
  maxFullDepthRatio: number;      // from Link Flow Summary (Max/Full Depth)
}

export interface ParsedRptSummary {
  nodes: Record<string, ParsedRptNode>;
  links: Record<string, ParsedRptLink>;
  flowRoutingErrorPercent?: number;
  runoffErrorPercent?: number;
}

/**
 * Parses raw SWMM .rpt text report output
 * @param text The plain text content of the SWMM .rpt file
 */
export function parseRptReport(text: string): ParsedRptSummary {
  const nodes: Record<string, ParsedRptNode> = {};
  const links: Record<string, ParsedRptLink> = {};
  let flowRoutingErrorPercent: number | undefined;
  let runoffErrorPercent: number | undefined;

  const lines = text.split(/\r?\n/);
  let currentTable: 'none' | 'flooding' | 'inflow' | 'link' = 'none';
  let dashCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 1. Parse flow routing continuity error
    if (line.includes("Flow Routing Continuity Error")) {
      const match = line.match(/[-+]?[0-9]*\.?[0-9]+/);
      if (match) {
        flowRoutingErrorPercent = parseFloat(match[0]);
      }
    }

    // 2. Parse runoff quantity continuity error
    if (line.includes("Runoff Quantity Continuity")) {
      // Scan forward up to 10 lines to locate the continuity error percentage
      for (let j = 1; j <= 10 && (i + j) < lines.length; j++) {
        const nextLine = lines[i + j].trim();
        if (nextLine.includes("Continuity Error")) {
          const match = nextLine.match(/[-+]?[0-9]*\.?[0-9]+/);
          if (match) {
            runoffErrorPercent = parseFloat(match[0]);
            break;
          }
        }
      }
    }

    // 3. Table Header detection
    if (line.includes("Node Flooding Summary")) {
      currentTable = 'flooding';
      dashCount = 0;
      continue;
    }
    if (line.includes("Node Inflow Summary")) {
      currentTable = 'inflow';
      dashCount = 0;
      continue;
    }
    if (line.includes("Link Flow Summary")) {
      currentTable = 'link';
      dashCount = 0;
      continue;
    }

    // 4. Handle table data collection
    if (currentTable !== 'none') {
      if (line.startsWith("---")) {
        dashCount++;
        continue;
      }

      // Exit table condition: blank line, or starts with section separators if we already exited headers
      if (dashCount >= 2 && (line === "" || line.startsWith("===") || line.includes("Summary") || line.includes("Analysis Began"))) {
        currentTable = 'none';
        dashCount = 0;
        continue;
      }

      // Skip lines until headers (consisting of dashed delimiters) are completed
      if (dashCount < 2) {
        continue;
      }

      if (line === "") {
        continue;
      }

      // Split row values by whitespace
      const cols = line.split(/\s+/);
      if (cols.length < 3) continue;

      const name = cols[0];
      const type = cols[1];

      // Exclude header matching or dash separators
      if (name.includes("-") || name === "Node" || name === "Link" || name === "Type") {
        continue;
      }

      if (currentTable === 'flooding') {
        // Form: Node  Type  Maximum_Flooding_Flow  Days  HrMin  Total_Flooding_Volume  Maximum_Ponded_Depth
        const maxFloodingFlow = parseFloat(cols[2]);
        const totalFloodingVolume = parseFloat(cols[5]);
        const maxPondedDepth = parseFloat(cols[6]);

        if (!nodes[name]) {
          nodes[name] = { name, type };
        }
        nodes[name].maxFloodingFlow = isNaN(maxFloodingFlow) ? 0 : maxFloodingFlow;
        nodes[name].totalFloodingVolume = isNaN(totalFloodingVolume) ? 0 : totalFloodingVolume;
        nodes[name].maxPondedDepth = isNaN(maxPondedDepth) ? 0 : maxPondedDepth;
      } 
      else if (currentTable === 'inflow') {
        // Form: Node  Type  Maximum_Inflow_Flow  Days  HrMin  Total_Inflow_Volume  Lateral_Inflow_Volume
        const maxInflow = parseFloat(cols[2]);
        const totalInflowVolume = parseFloat(cols[5]);
        const lateralInflowVolume = parseFloat(cols[6]);

        if (!nodes[name]) {
          nodes[name] = { name, type };
        }
        nodes[name].maxInflow = isNaN(maxInflow) ? 0 : maxInflow;
        nodes[name].totalInflowVolume = isNaN(totalInflowVolume) ? 0 : totalInflowVolume;
        nodes[name].lateralInflowVolume = isNaN(lateralInflowVolume) ? 0 : lateralInflowVolume;
      } 
      else if (currentTable === 'link') {
        // Form: Link  Type  Maximum_Flow  Days  HrMin  Maximum_Velocity  Max_Full_Flow  Max_Full_Depth
        const maxFlow = parseFloat(cols[2]);
        const maxVelocity = parseFloat(cols[5]);
        const maxFullFlowRatio = parseFloat(cols[6]);
        const maxFullDepthRatio = parseFloat(cols[7]);

        links[name] = {
          name,
          type,
          maxFlow: isNaN(maxFlow) ? 0 : maxFlow,
          maxVelocity: isNaN(maxVelocity) ? 0 : maxVelocity,
          maxFullFlowRatio: isNaN(maxFullFlowRatio) ? 0 : maxFullFlowRatio,
          maxFullDepthRatio: isNaN(maxFullDepthRatio) ? 0 : maxFullDepthRatio
        };
      }
    }
  }

  return {
    nodes,
    links,
    flowRoutingErrorPercent,
    runoffErrorPercent
  };
}

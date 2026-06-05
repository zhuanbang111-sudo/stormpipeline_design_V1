export interface Env {
  DB: D1Database;
}

// Declare D1 Database interfaces to ensure type safety in local compilation
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(colName?: string): Promise<T | null>;
  run<T = any>(): Promise<D1Result<T>>;
  all<T = any>(): Promise<D1Result<T>>;
}

export interface D1Result<T = any> {
  results: T[];
  success: boolean;
  error?: string;
  meta: any;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

/**
 * Automagic Table Schema Bootstrap
 * Checks and creates the D1 database tables if they do not exist.
 * This guarantees the fullstack app functions properly on first boot.
 */
async function ensureTablesExist(db: any) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      boundary_polygon_json TEXT,
      spatial_anchor_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS network_nodes (
      id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      type TEXT,
      lat REAL,
      lng REAL,
      x REAL,
      y REAL,
      elevation REAL,
      bottomElevation REAL,
      groundElevation REAL,
      maxDepth REAL,
      name TEXT,
      waterLevel REAL,
      overflowRate REAL,
      PRIMARY KEY (id, scenario_id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS network_links (
      id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      fromNodeId TEXT,
      toNodeId TEXT,
      source TEXT,
      target TEXT,
      length REAL,
      diameter REAL,
      height REAL,
      shape TEXT,
      material TEXT,
      roughness REAL,
      name TEXT,
      slope REAL,
      PRIMARY KEY (id, scenario_id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS network_catchments (
      id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      name TEXT,
      area REAL,
      runoffCoefficient REAL,
      runOffCoef REAL,
      timeOfConcentration REAL,
      outletNodeId TEXT,
      nodeCtx TEXT,
      polygon_vertices TEXT,
      PRIMARY KEY (id, scenario_id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );
  `);
  
  // Safe column migration if table existed before adding these keys
  try {
    await db.exec(`ALTER TABLE scenarios ADD COLUMN boundary_polygon_json TEXT;`);
  } catch (e) {
    // Column already exists, safe to ignore
  }
  try {
    await db.exec(`ALTER TABLE scenarios ADD COLUMN spatial_anchor_json TEXT;`);
  } catch (e) {
    // Column already exists, safe to ignore
  }
}

/**
 * POST /api/scenarios
 * High-performance transaction utilizing env.DB.batch to save full network snapshot
 */
export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const db = env.DB;
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare D1 Database binding 'DB' is missing in wrangler.toml or context." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 1. Instantly bootstrap schema if needed
    await ensureTablesExist(db);

    // 2. Extract and validate layout payload
    const body: any = await request.json();
    const { id, name, description, nodes, links, catchments, boundaryPolygon, spatialAnchor } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: "Missing required parameter 'name' for the scenario." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const scenarioId = id || crypto.randomUUID();
    const statements: any[] = [];

    // Clean up past entries to perform consistent overwrite
    statements.push(db.prepare(`DELETE FROM network_nodes WHERE scenario_id = ?`).bind(scenarioId));
    statements.push(db.prepare(`DELETE FROM network_links WHERE scenario_id = ?`).bind(scenarioId));
    statements.push(db.prepare(`DELETE FROM network_catchments WHERE scenario_id = ?`).bind(scenarioId));
    statements.push(db.prepare(`DELETE FROM scenarios WHERE id = ?`).bind(scenarioId));

    // Insert scenario header
    statements.push(
      db.prepare(`INSERT INTO scenarios (id, name, description, boundary_polygon_json, spatial_anchor_json, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
        .bind(
          scenarioId, 
          name, 
          description || "", 
          boundaryPolygon ? JSON.stringify(boundaryPolygon) : null,
          spatialAnchor ? JSON.stringify(spatialAnchor) : null
        )
    );

    // Build batch insertions for nodes
    if (nodes && Array.isArray(nodes)) {
      for (const node of nodes) {
        statements.push(
          db.prepare(`
            INSERT INTO network_nodes (
              id, scenario_id, type, lat, lng, x, y, elevation, bottomElevation, groundElevation, maxDepth, name, waterLevel, overflowRate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            node.id,
            scenarioId,
            node.type || 'manhole',
            node.lat || 0,
            node.lng || 0,
            node.x || 0,
            node.y || 0,
            node.elevation || 0,
            node.bottomElevation || 0,
            node.groundElevation || 0,
            node.maxDepth || 0,
            node.name || "",
            node.waterLevel || 0,
            node.overflowRate || 0
          )
        );
      }
    }

    // Build batch insertions for links
    if (links && Array.isArray(links)) {
      for (const link of links) {
        statements.push(
          db.prepare(`
            INSERT INTO network_links (
              id, scenario_id, fromNodeId, toNodeId, source, target, length, diameter, height, shape, material, roughness, name, slope
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            link.id,
            scenarioId,
            link.fromNodeId || link.source || "",
            link.toNodeId || link.target || "",
            link.source || "",
            link.target || "",
            link.length || 0,
            link.diameter || 0,
            link.height || 0,
            link.shape || 'circular',
            link.material || "",
            link.roughness || 0,
            link.name || "",
            link.slope || 0
          )
        );
      }
    }

    // Build batch insertions for catchments
    if (catchments && Array.isArray(catchments)) {
      for (const catchment of catchments) {
        const vertices = catchment.polygonVertices || catchment.polygon || [];
        const verticesJson = JSON.stringify(vertices);

        statements.push(
          db.prepare(`
            INSERT INTO network_catchments (
              id, scenario_id, name, area, runoffCoefficient, runOffCoef, timeOfConcentration, outletNodeId, nodeCtx, polygon_vertices
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            catchment.id,
            scenarioId,
            catchment.name || "",
            catchment.area || 0,
            catchment.runoffCoefficient || catchment.runOffCoef || 0,
            catchment.runOffCoef || catchment.runoffCoefficient || 0,
            catchment.timeOfConcentration || 0,
            catchment.outletNodeId || catchment.nodeCtx || "",
            catchment.nodeCtx || catchment.outletNodeId || "",
            verticesJson
          )
        );
      }
    }

    // 3. Atomically execute all statements in transaction
    await db.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: "管网剧本已完美同步至云端 D1 数据库 (Scenario synced safely).",
      id: scenarioId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

/**
 * GET /api/scenarios
 * Returns detailed state if ?id=xxx is specified, else returns listed meta summaries.
 */
export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare D1 Database binding 'DB' is missing in wrangler.toml or context." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    await ensureTablesExist(db);

    const url = new URL(request.url);
    const scenarioId = url.searchParams.get("id");

    if (scenarioId) {
      // 1. Fetch scenario header
      const scenarioRes = await db.prepare("SELECT * FROM scenarios WHERE id = ?").bind(scenarioId).first<any>();
      if (!scenarioRes) {
        return new Response(JSON.stringify({ error: `未寻找到指定 ID [${scenarioId}] 的管网快照。` }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      let boundaryPolygon = null;
      try {
        if (scenarioRes.boundary_polygon_json) {
          boundaryPolygon = JSON.parse(scenarioRes.boundary_polygon_json);
        }
      } catch (e) {
        console.error("Error parsing boundary_polygon_json", e);
      }

      let spatialAnchor = null;
      try {
        if (scenarioRes.spatial_anchor_json) {
          spatialAnchor = JSON.parse(scenarioRes.spatial_anchor_json);
        }
      } catch (e) {
        console.error("Error parsing spatial_anchor_json", e);
      }

      // 2. Fetch network components
      const nodesResult = await db.prepare("SELECT * FROM network_nodes WHERE scenario_id = ?").bind(scenarioId).all<any>();
      const linksResult = await db.prepare("SELECT * FROM network_links WHERE scenario_id = ?").bind(scenarioId).all<any>();
      const catchmentsResult = await db.prepare("SELECT * FROM network_catchments WHERE scenario_id = ?").bind(scenarioId).all<any>();

      const nodes = (nodesResult.results || []).map((node) => ({
        id: node.id,
        type: node.type,
        lat: node.lat,
        lng: node.lng,
        x: node.x,
        y: node.y,
        elevation: node.elevation,
        bottomElevation: node.bottomElevation,
        groundElevation: node.groundElevation,
        maxDepth: node.maxDepth,
        name: node.name,
        waterLevel: node.waterLevel,
        overflowRate: node.overflowRate
      }));

      const links = (linksResult.results || []).map((link) => ({
        id: link.id,
        fromNodeId: link.fromNodeId,
        toNodeId: link.toNodeId,
        source: link.source,
        target: link.target,
        length: link.length,
        diameter: link.diameter,
        height: link.height,
        shape: link.shape,
        material: link.material,
        roughness: link.roughness,
        name: link.name,
        slope: link.slope
      }));

      const catchments = (catchmentsResult.results || []).map((c) => {
        let parsedVertices: [number, number][] = [];
        try {
          parsedVertices = JSON.parse(c.polygon_vertices || "[]");
        } catch (e) {
          console.error("Error parsing polygon_vertices", e);
        }
        return {
          id: c.id,
          name: c.name,
          area: c.area,
          runoffCoefficient: c.runoffCoefficient,
          runOffCoef: c.runOffCoef,
          timeOfConcentration: c.timeOfConcentration,
          outletNodeId: c.outletNodeId,
          nodeCtx: c.nodeCtx,
          polygon: parsedVertices,
          polygonVertices: parsedVertices
        };
      });

      return new Response(JSON.stringify({
        id: scenarioRes.id,
        name: scenarioRes.name,
        description: scenarioRes.description,
        created_at: scenarioRes.created_at,
        boundaryPolygon,
        spatialAnchor,
        nodes,
        links,
        catchments
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } else {
      // Return lists ordered by date descending
      const listRes = await db.prepare("SELECT id, name, description, created_at FROM scenarios ORDER BY created_at DESC").all<any>();
      return new Response(JSON.stringify(listRes.results || []), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

/**
 * DELETE /api/scenarios
 * Cascade and safely wipe custom networks
 */
export const onRequestDelete = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare D1 Database binding 'DB' is missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    await ensureTablesExist(db);
    const url = new URL(request.url);
    const scenarioId = url.searchParams.get("id");

    if (!scenarioId) {
      return new Response(JSON.stringify({ error: "Missing required parameter 'id' for scenario deletion." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const statements = [
      db.prepare("DELETE FROM network_nodes WHERE scenario_id = ?").bind(scenarioId),
      db.prepare("DELETE FROM network_links WHERE scenario_id = ?").bind(scenarioId),
      db.prepare("DELETE FROM network_catchments WHERE scenario_id = ?").bind(scenarioId),
      db.prepare("DELETE FROM scenarios WHERE id = ?").bind(scenarioId)
    ];

    await db.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: `管网剧本方案 [id: ${scenarioId}] 在数据库中已被彻底销毁。`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

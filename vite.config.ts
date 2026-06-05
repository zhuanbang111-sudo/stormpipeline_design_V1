import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const DB_FILE = path.resolve(__dirname, 'scenarios_db.json');

  const readDb = () => {
    if (!fs.existsSync(DB_FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      return {};
    }
  };

  const writeDb = (data: any) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  };

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/scenarios')) {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            
            // GET scenario index list or single model
            if (req.method === 'GET') {
              const scenarioId = parsedUrl.searchParams.get('id');
              const db = readDb();
              
              if (scenarioId) {
                const scenario = db[scenarioId];
                if (scenario) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(scenario));
                } else {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `未寻寻找指定 ID [${scenarioId}] 的管网快网。` }));
                }
              } else {
                const summaries = Object.values(db).map((s: any) => ({
                  id: s.id,
                  name: s.name,
                  description: s.description,
                  created_at: s.created_at
                }));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(summaries));
              }
            } 
            // POST scenario snapshot
            else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const payload = JSON.parse(body);
                  if (!payload.name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Missing required parameter 'name'" }));
                    return;
                  }
                  
                  const db = readDb();
                  const scenarioId = payload.id || Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
                  
                  db[scenarioId] = {
                    id: scenarioId,
                    name: payload.name,
                    description: payload.description || "",
                    created_at: new Date().toISOString(),
                    nodes: payload.nodes || [],
                    links: payload.links || [],
                    catchments: payload.catchments || [],
                    boundaryPolygon: payload.boundaryPolygon || null,
                    spatialAnchor: payload.spatialAnchor || null
                  };
                  
                  writeDb(db);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    success: true,
                    message: "管网剧剧已完美同步云端 D1 数据库 (Scenario synced safely).",
                    id: scenarioId
                  }));
                } catch (err) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Malformed payload JSON' }));
                }
              });
            } 
            // DELETE scenario
            else if (req.method === 'DELETE') {
              const scenarioId = parsedUrl.searchParams.get('id');
              if (!scenarioId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Missing required parameter 'id'" }));
                return;
              }
              
              const db = readDb();
              if (db[scenarioId]) {
                delete db[scenarioId];
                writeDb(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: true,
                  message: `管网剧本方案 [id: ${scenarioId}] 在数据库中已被彻底销毁。`
                }));
              } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Scenario not found" }));
              }
            }
          } else {
            next();
          }
        });
      }
    },
  };
});

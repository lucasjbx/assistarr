// Entrypoint del add-on: traduce las opciones de Supervisor (/data/options.json) a las
// variables de entorno que espera tools.mjs, y despues arranca el servidor Streamable HTTP.
import { readFileSync } from "node:fs";

const options = JSON.parse(readFileSync("/data/options.json", "utf8"));

if (options.radarr_url) process.env.RADARR_URL = options.radarr_url;
if (options.radarr_api_key) process.env.RADARR_API_KEY = options.radarr_api_key;
if (options.sonarr_url) process.env.SONARR_URL = options.sonarr_url;
if (options.sonarr_api_key) process.env.SONARR_API_KEY = options.sonarr_api_key;
if (options.port) process.env.MCP_LOCAL_PORT = String(options.port);

await import("./sse-server.mjs");

// Anuncia el servidor MCP al Supervisor para que HA (2026.10+) lo descubra y ofrezca
// configurar la integracion "Model Context Protocol" con un solo clic. Si falla, el
// servidor sigue funcionando y se puede configurar a mano.
try {
  const headers = { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}` };
  const self = await fetch("http://supervisor/addons/self/info", { headers }).then((r) => r.json());
  const url = `http://${self.data.hostname}:${options.port || 8787}/mcp`;
  const res = await fetch("http://supervisor/discovery", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ service: "mcp", config: { url } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  console.log(`Discovery MCP anunciado al Supervisor: ${url}`);
} catch (err) {
  console.warn(`No se pudo anunciar el discovery MCP: ${err.message}`);
}

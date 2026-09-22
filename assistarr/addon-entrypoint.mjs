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

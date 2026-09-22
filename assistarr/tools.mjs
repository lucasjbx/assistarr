import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEnv() {
  const envPath = join(__dirname, ".env");
  const fileVars = {};
  try {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      fileVars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  } catch {
    // Sin .env local (caso add-on): se usan las variables ya seteadas en process.env.
  }
  const keys = ["RADARR_URL", "RADARR_API_KEY", "SONARR_URL", "SONARR_API_KEY", "MCP_LOCAL_PORT"];
  const env = {};
  for (const key of keys) env[key] = process.env[key] ?? fileVars[key];
  return env;
}

const env = loadEnv();

const services = {
  radarr: { url: env.RADARR_URL, apiKey: env.RADARR_API_KEY },
  sonarr: { url: env.SONARR_URL, apiKey: env.SONARR_API_KEY },
};

async function api(service, path, { method = "GET", body } = {}) {
  const cfg = services[service];
  const res = await fetch(`${cfg.url}/api/v3${path}`, {
    method,
    headers: {
      "X-Api-Key": cfg.apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${service} ${method} ${path} -> HTTP ${res.status}: ${text}`);
  }
  return data;
}

export { env };

export const tools = [
  {
    name: "radarr_search_movie",
    description: "Busca peliculas por titulo en TMDB via Radarr. Devuelve tmdbId, titulo, anio, y si ya esta en la biblioteca.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Titulo de la pelicula" } },
      required: ["query"],
    },
    handler: async ({ query }) => {
      const results = await api("radarr", `/movie/lookup?term=${encodeURIComponent(query)}`);
      return results.slice(0, 8).map((m) => ({
        tmdbId: m.tmdbId,
        title: m.title,
        year: m.year,
        overview: m.overview?.slice(0, 200),
        alreadyInLibrary: !!m.id,
      }));
    },
  },
  {
    name: "radarr_add_movie",
    description: "Agrega una pelicula a Radarr por tmdbId y dispara la busqueda de descarga.",
    inputSchema: {
      type: "object",
      properties: {
        tmdbId: { type: "number" },
        qualityProfileId: { type: "number", description: "Usar radarr_quality_profiles para ver opciones" },
        rootFolderPath: { type: "string", description: "Usar radarr_root_folders para ver opciones" },
        searchNow: { type: "boolean", default: true },
      },
      required: ["tmdbId", "qualityProfileId", "rootFolderPath"],
    },
    handler: async ({ tmdbId, qualityProfileId, rootFolderPath, searchNow = true }) => {
      const [lookup] = await api("radarr", `/movie/lookup/tmdb?tmdbId=${tmdbId}`).then((r) =>
        Array.isArray(r) ? r : [r]
      );
      const payload = {
        title: lookup.title,
        tmdbId,
        qualityProfileId,
        rootFolderPath,
        monitored: true,
        addOptions: { searchForMovie: searchNow },
      };
      const added = await api("radarr", "/movie", { method: "POST", body: payload });
      return { id: added.id, title: added.title, status: "added" };
    },
  },
  {
    name: "radarr_root_folders",
    description: "Lista las carpetas raiz configuradas en Radarr.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => api("radarr", "/rootfolder"),
  },
  {
    name: "radarr_quality_profiles",
    description: "Lista los perfiles de calidad configurados en Radarr.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => (await api("radarr", "/qualityprofile")).map((p) => ({ id: p.id, name: p.name })),
  },
  {
    name: "radarr_queue",
    description: "Muestra la cola de descargas actual de Radarr.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => api("radarr", "/queue"),
  },
  {
    name: "sonarr_search_series",
    description: "Busca series por titulo en TVDB via Sonarr. Devuelve tvdbId, titulo, anio, y si ya esta en la biblioteca.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Titulo de la serie" } },
      required: ["query"],
    },
    handler: async ({ query }) => {
      const results = await api("sonarr", `/series/lookup?term=${encodeURIComponent(query)}`);
      return results.slice(0, 8).map((s) => ({
        tvdbId: s.tvdbId,
        title: s.title,
        year: s.year,
        overview: s.overview?.slice(0, 200),
        alreadyInLibrary: !!s.id,
      }));
    },
  },
  {
    name: "sonarr_add_series",
    description: "Agrega una serie a Sonarr por tvdbId y dispara la busqueda de descarga.",
    inputSchema: {
      type: "object",
      properties: {
        tvdbId: { type: "number" },
        qualityProfileId: { type: "number", description: "Usar sonarr_quality_profiles para ver opciones" },
        rootFolderPath: { type: "string", description: "Usar sonarr_root_folders para ver opciones" },
        seasonFolder: { type: "boolean", default: true },
        searchNow: { type: "boolean", default: true },
      },
      required: ["tvdbId", "qualityProfileId", "rootFolderPath"],
    },
    handler: async ({ tvdbId, qualityProfileId, rootFolderPath, seasonFolder = true, searchNow = true }) => {
      const lookup = await api("sonarr", `/series/lookup?term=tvdb:${tvdbId}`);
      const series = lookup[0];
      const payload = {
        title: series.title,
        tvdbId,
        qualityProfileId,
        rootFolderPath,
        seasonFolder,
        monitored: true,
        seasons: series.seasons,
        addOptions: { searchForMissingEpisodes: searchNow },
      };
      const added = await api("sonarr", "/series", { method: "POST", body: payload });
      return { id: added.id, title: added.title, status: "added" };
    },
  },
  {
    name: "sonarr_root_folders",
    description: "Lista las carpetas raiz configuradas en Sonarr.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => api("sonarr", "/rootfolder"),
  },
  {
    name: "sonarr_quality_profiles",
    description: "Lista los perfiles de calidad configurados en Sonarr.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => (await api("sonarr", "/qualityprofile")).map((p) => ({ id: p.id, name: p.name })),
  },
  {
    name: "sonarr_queue",
    description: "Muestra la cola de descargas actual de Sonarr.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => api("sonarr", "/queue"),
  },
];

export const SERVER_INFO = { name: "Assistarr", version: "1.0.0" };
export const SERVER_CAPABILITIES = { tools: {} };

export function createServer() {
  const server = new Server(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      return { content: [{ type: "text", text: `Herramienta desconocida: ${request.params.name}` }], isError: true };
    }
    try {
      const result = await tool.handler(request.params.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });

  return server;
}

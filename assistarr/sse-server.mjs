// Servidor MCP (Streamable HTTP) para la integracion nativa "Model Context Protocol" de Home
// Assistant (Ajustes > Dispositivos y servicios > Agregar integracion > "Model Context Protocol").
// Uso interno a la red de HA unicamente (no exponer a internet). URL a configurar en HA:
//   http://localhost:8787/mcp
// Corre como add-on propio con host_network: true (repo "assistarr"), por eso comparte la red
// del host con HA Core y se puede llamar por localhost en vez de un hostname de Supervisor.
// Puerto configurable con la opcion "port" del add-on (MCP_LOCAL_PORT internamente, default 8787).
//
// Nota (2026-09-20): el nombre del archivo quedo como "sse-server.mjs" por historia, pero
// implementa Streamable HTTP, no el transporte SSE clasico (se detecto con
// ha_get_logs source=error_log search=mcp que HA usa mcp/client/streamable_http.py).
// Ademas: hay que crear una sesion (Server+Transport) NUEVA por cada handshake "initialize" -
// una sola sesion global rechaza reconexiones con "Server already initialized".
import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createMcpServer, env } from "./tools.mjs";

const port = Number(env.MCP_LOCAL_PORT || 8787);
const sessions = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== "/mcp") {
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }
    res.writeHead(404).end("Not found");
    return;
  }

  const sessionId = req.headers["mcp-session-id"];

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId);
    const body = req.method === "POST" ? await readBody(req) : undefined;
    await transport.handleRequest(req, res, body);
    return;
  }

  if (!sessionId && req.method === "POST") {
    const body = await readBody(req);
    if (!isInitializeRequest(body)) {
      res.writeHead(400, { "Content-Type": "application/json" }).end(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "No session, and not an initialize request" }, id: null })
      );
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => sessions.set(sid, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  res.writeHead(400, { "Content-Type": "application/json" }).end(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Sesion desconocida" }, id: null })
  );
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`media-mcp Streamable HTTP escuchando en 0.0.0.0:${port} (/mcp)`);
});

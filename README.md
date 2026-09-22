# Assistarr

Repositorio de add-ons de Home Assistant. Add-on `assistarr`: servidor MCP (Streamable HTTP)
que expone herramientas de Radarr y Sonarr (buscar/agregar películas y series) para que las
use HA Assist (vía la integración nativa "Model Context Protocol") y también clientes MCP
externos como Claude o Gemini.

## Instalación

1. Settings > Add-ons > Add-on Store > ⋮ > Repositories > agregar `https://github.com/lucasjbx/assistarr`
2. Instalar el add-on **Assistarr**.
3. Configurar en sus opciones: `radarr_url`, `radarr_api_key`, `sonarr_url`, `sonarr_api_key`.
4. Iniciar el add-on (`host_network: true`, escucha en `0.0.0.0:8787`, endpoint `/mcp`).
5. En HA: Ajustes > Dispositivos y servicios > Agregar integración > "Model Context Protocol",
   URL `http://localhost:8787/mcp`.

# OniPin MCP (Desktop Extension)

Thin **local MCP client** for [Claude Desktop](https://claude.ai/download). Talk to businesses that publish an OniPin pin (`onp_…`).

This repository contains **only** the Desktop Extension / MCPB wrapper. It calls the **public** OniPin HTTP API (`https://onnivers.store` by default). It does **not** include the OniPin platform application, database, or private server source.

## What it does

| Tool | Purpose |
|------|---------|
| `buscar_negocio` | Look up a business by pin |
| `obtener_catalogo` | Product / service catalog |
| `enviar_mensaje` | Chat with the business AI |
| `leer_conversacion` | Read thread messages |
| `crear_reserva` | Request a booking |
| `comprar_producto` | Request an order (no payment processing) |
| `descubrir_url` | Resolve pin from a website URL |
| `handshake` | Optional protocol handshake |

## Install (Claude Desktop)

1. Download `onipin.mcpb` from [Releases](https://github.com/deivys1224-ctrl/onipin-mcp/releases) (or build below).
2. Double-click the `.mcpb` file, or: **Settings → Extensions → Install Extension…**
3. Optional: set API base URL (default `https://onnivers.store`).

## Example prompts

- “Look up pin `onp_vuzadcjv3xw7` and tell me what they sell.”
- “Get the catalog for that pin and ask about OnniVers Educación.”
- “Start a chat and request a cash purchase for product X.”

## Privacy

Conversations go through the public OniPin API and appear in the business CHATS inbox as an AI agent visit. Privacy policy: https://onnivers.com/privacidad

## Build `.mcpb` locally

```bash
npm install --omit=dev
npx @anthropic-ai/mcpb pack .
```

## License

MIT — see [LICENSE](./LICENSE). Applies to **this** repository only.

## Links

- Product: https://onnivers.store  
- Docs: https://onnivers.store/docs  
- Remote MCP (HTTP): `https://onnivers.store/mcp`  
- Issues: https://github.com/deivys1224-ctrl/onipin-mcp/issues  

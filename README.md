# OniPin Desktop Extension (MCPB)

**OniPin Desktop Extension enables Claude to connect with businesses through the OniPin protocol. Discover businesses using an `onp_` PIN, browse catalogs, chat with AI or human agents, request appointments, and create purchase requests through the public OniPin API.**

This repository is a **thin local MCP / MCPB client** for [Claude Desktop](https://claude.ai/download). It talks only to the **public** OniPin HTTP API (default [`https://onnivers.store`](https://onnivers.store)). It does **not** include the OniPin platform application, database, or private server source.

| File | Purpose |
|------|---------|
| [`LICENSE`](./LICENSE) | MIT (this repository only) |
| [`manifest.json`](./manifest.json) | Claude Desktop Extension metadata |
| [`package.json`](./package.json) | Node.js package & dependencies |
| [`server/`](./server/) | Stdio MCP entry point (public API client) |
| [Releases](https://github.com/deivys1224-ctrl/onipin-mcp/releases) | Prebuilt `onipin.mcpb` |

---

## What the extension does

OniPin businesses publish a unique pin (`onp_…`). With this extension, Claude can:

1. **Discover** a business by pin or from a website URL  
2. **Browse** its product / service catalog  
3. **Chat** with the business AI (and read human replies when the owner takes over)  
4. **Request appointments** (pending business approval)  
5. **Create purchase requests** (no card processing inside the MCP — the business coordinates payment in chat)

| Tool | Purpose |
|------|---------|
| `business_lookup` | Look up a business by `onp_` pin |
| `catalog_list` | List products and services |
| `chat_send` | Send a chat message (keep `conversationId` for follow-ups) |
| `chat_read` | Read messages in a conversation |
| `booking_create` | Request a booking / appointment |
| `order_create` | Request a product order |
| `discover_from_url` | Resolve a pin from a website URL |
| `protocol_handshake` | Optional OniPin protocol handshake |

---

## Installation (Claude Desktop)

1. Download **`onipin.mcpb`** from the latest [Release](https://github.com/deivys1224-ctrl/onipin-mcp/releases).  
2. Install one of:
   - Double-click `onipin.mcpb`, or  
   - Drag and drop into Claude Desktop, or  
   - **Settings → Extensions → Advanced → Install Extension…** and select the file.  
3. Confirm installation. Claude Desktop bundles Node.js — no extra runtime is required.

### Build from source (optional)

```bash
git clone https://github.com/deivys1224-ctrl/onipin-mcp.git
cd onipin-mcp
npm install --omit=dev
npx @anthropic-ai/mcpb pack .
```

Then install the generated `.mcpb` as above.

---

## Configuration

### Business pin (`onp_…`)

You do **not** configure a pin inside extension settings. Pass the business pin in the conversation, for example:

- “Look up pin `onp_vuzadcjv3xw7` and tell me what they sell.”  
- “Get the catalog for `onp_…` and ask about product X.”

Pins look like: `onp_` + 8–32 lowercase letters/digits (e.g. `onp_vuzadcjv3xw7`).

### API base URL (optional)

In the extension settings you can set **OniPin API base URL**.

| Setting | Default | When to change |
|---------|---------|----------------|
| `base_url` | `https://onnivers.store` | Only if you point at a custom OniPin deployment |

### Token / authentication

**No API token is required** for normal use. This client calls the **public** OniPin API (`/v1`). There is no OAuth or secret to paste for Claude Desktop.

If you self-host and later enable a private MCP token on the server, that is outside this Desktop Extension’s default setup.

---

## Example prompts

- “Look up pin `onp_vuzadcjv3xw7` and summarize what the business offers.”  
- “Get the catalog for that pin and ask about OnniVers Educación.”  
- “Start a chat, request a purchase, and complete payment as cash or with a written payment reference.”  

---

## Privacy & terms

- Traffic goes to the public OniPin API; chats appear in the business **CHATS** inbox as an AI-agent visit.  
- Privacy policy: https://onnivers.com/privacidad  
- Terms: https://onnivers.com/terminos  
- Product docs: https://onnivers.store/docs  

---

## Cursor / Open Plugins

This repo also follows the [Open Plugins](https://open-plugins.com) layout so it can be submitted to [cursor.directory](https://cursor.directory/plugins/new):

| Path | Purpose |
|------|---------|
| [`.mcp.json`](./.mcp.json) | MCP server → `https://onnivers.store/mcp` |
| [`.plugin/plugin.json`](./.plugin/plugin.json) | Vendor-neutral plugin manifest |
| [`.cursor-plugin/plugin.json`](./.cursor-plugin/plugin.json) | Cursor-prefixed plugin manifest |

Scan URL: `https://github.com/deivys1224-ctrl/onipin-mcp`

---

## License

[MIT](./LICENSE) — applies to **this** public repository only (Desktop Extension / MCP client). The commercial OniPin platform is separate and not published here.

## Links

- Product: https://onnivers.store  
- Docs: https://onnivers.store/docs  
- Remote MCP (HTTP, not this package): `https://onnivers.store/mcp`  
- Issues: https://github.com/deivys1224-ctrl/onipin-mcp/issues  

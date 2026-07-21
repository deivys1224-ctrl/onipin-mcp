#!/usr/bin/env node
/**
 * OniPin MCP (stdio) — Claude Desktop / MCPB entry point.
 * Thin client: only calls the public OniPin HTTP API (default https://onnivers.store).
 * Does not include platform source, database, or private server code.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOniPinMcpServer } from "./mcp-server.mjs";

const server = createOniPinMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  "[onipin-mcp] ready (stdio) →",
  process.env.ONIPIN_BASE_URL || "https://onnivers.store",
);

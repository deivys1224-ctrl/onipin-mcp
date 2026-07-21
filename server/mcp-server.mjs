/**
 * OniPin MCP tools — public API client only.
 * All business logic lives on https://onnivers.store (/v1). This package is a thin wrapper.
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const DEFAULT_BASE_URL = "https://onnivers.store";

function baseUrl() {
  return (process.env.ONIPIN_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function api(path, init = {}) {
  const res = await fetch(baseUrl() + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Caller-Type": "ai-agent",
      ...(init.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `OniPin API error (${res.status})`);
  }
  return payload;
}

function jsonContent(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const pinSchema = z
  .string()
  .regex(/^onp_[a-z0-9]{8,32}$/, "OniPin pin format: onp_xxxxxxxx")
  .describe("Business pin (e.g. onp_vuzadcjv3xw7)");

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

const writeSideEffect = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
};

export function createOniPinMcpServer() {
  const server = new McpServer({
    name: "onipin",
    version: "1.0.0",
  });

  server.registerTool(
    "descubrir_url",
    {
      title: "Discover OniPin pin from a website URL",
      description:
        "Resolve an OniPin business pin from a website URL (meta onipin, llms.txt, well-known).",
      inputSchema: {
        url: z.string().url().describe("Business website URL"),
      },
      annotations: { ...readOnly, title: "Discover OniPin pin from a website URL" },
    },
    async ({ url }) => jsonContent(await api(`/v1/discover?url=${encodeURIComponent(url)}`)),
  );

  server.registerTool(
    "handshake",
    {
      title: "Handshake with an OniPin business",
      description:
        "Optional greeting announcing your agent and intent before chat (appointment.create, order.create, business.chat…).",
      inputSchema: {
        pin: pinSchema,
        intent: z.string().optional().describe("Intent, e.g. business.chat"),
        agente: z.string().max(80).optional().describe("External agent name"),
      },
      annotations: { ...writeSideEffect, title: "Handshake with an OniPin business" },
    },
    async ({ pin, intent, agente }) =>
      jsonContent(
        await api(`/v1/handshake/${encodeURIComponent(pin)}`, {
          method: "POST",
          body: JSON.stringify({
            intent: intent || "business.chat",
            agent: { name: agente || "Agente MCP", version: "1.0" },
          }),
        }),
      ),
  );

  server.registerTool(
    "buscar_negocio",
    {
      title: "Look up an OniPin business",
      description: "Discovery: name, description, language, capabilities and endpoints for a pin.",
      inputSchema: { pin: pinSchema },
      annotations: { ...readOnly, title: "Look up an OniPin business" },
    },
    async ({ pin }) => jsonContent(await api(`/v1/ping/${encodeURIComponent(pin)}`)),
  );

  server.registerTool(
    "enviar_mensaje",
    {
      title: "Send a chat message to a business",
      description:
        "Chat with the business AI. Returns conversationId — pass it on later turns to keep the thread.",
      inputSchema: {
        pin: pinSchema,
        mensaje: z.string().min(1).max(4000).describe("Message text"),
        conversationId: z.string().optional().describe("Existing conversation id"),
        nombre: z.string().max(80).optional().describe("Your display name"),
        intent: z.string().optional().describe("OniPin intent"),
      },
      annotations: { ...writeSideEffect, title: "Send a chat message to a business" },
    },
    async ({ pin, mensaje, conversationId, nombre, intent }) =>
      jsonContent(
        await api(`/v1/chat/${encodeURIComponent(pin)}`, {
          method: "POST",
          headers: {
            ...(intent ? { "X-Oni-Intent": intent } : {}),
            ...(nombre ? { "X-Oni-Agent": nombre } : {}),
          },
          body: JSON.stringify({
            message: mensaje,
            conversationId: conversationId || undefined,
            callerName: nombre || "Agente MCP",
            agent: { name: nombre || "Agente MCP", version: "1.0" },
            intent: intent || undefined,
          }),
        }),
      ),
  );

  server.registerTool(
    "leer_conversacion",
    {
      title: "Read conversation messages",
      description: "Read messages in an existing conversation (bot and human owner replies).",
      inputSchema: {
        pin: pinSchema,
        conversationId: z.string().min(8).describe("Conversation id from enviar_mensaje"),
        after: z.string().optional().describe("Only messages after this ISO timestamp"),
      },
      annotations: { ...readOnly, title: "Read conversation messages" },
    },
    async ({ pin, conversationId, after }) => {
      const qs = after ? `?after=${encodeURIComponent(after)}` : "";
      return jsonContent(
        await api(
          `/v1/chat/${encodeURIComponent(pin)}/${encodeURIComponent(conversationId)}/messages${qs}`,
        ),
      );
    },
  );

  server.registerTool(
    "obtener_catalogo",
    {
      title: "Get product catalog",
      description: "List active products/services with name, price, kind and image.",
      inputSchema: { pin: pinSchema },
      annotations: { ...readOnly, title: "Get product catalog" },
    },
    async ({ pin }) => jsonContent(await api(`/v1/catalog/${encodeURIComponent(pin)}`)),
  );

  server.registerTool(
    "crear_reserva",
    {
      title: "Request a booking",
      description:
        "Create a pending booking request in the business CHATS inbox. Contact or client pin required.",
      inputSchema: {
        pin: pinSchema,
        servicio: z.string().min(1).max(200).describe("Service or reason"),
        fecha: z.string().min(1).max(80).describe("Desired date/time label"),
        nombreCliente: z.string().min(1).max(80).describe("Client name"),
        contacto: z.string().max(160).optional().describe("Phone or email"),
        pinCliente: z.string().max(64).optional().describe("Client OniPin pin if any"),
        contactoRechazado: z.boolean().optional().describe("Client declined sharing contact"),
        notas: z.string().max(1000).optional().describe("Extra notes"),
        conversationId: z.string().optional().describe("Existing thread"),
      },
      annotations: { ...writeSideEffect, title: "Request a booking" },
    },
    async ({
      pin,
      servicio,
      fecha,
      nombreCliente,
      contacto,
      pinCliente,
      contactoRechazado,
      notas,
      conversationId,
    }) => {
      const booking = await api(`/v1/bookings/${encodeURIComponent(pin)}`, {
        method: "POST",
        body: JSON.stringify({
          service: servicio,
          scheduledLabel: fecha,
          clientName: nombreCliente,
          clientContact: contacto,
          callerPin: pinCliente,
          contactDeclined: contactoRechazado,
          notes: notas,
          conversationId: conversationId || undefined,
        }),
      });
      return jsonContent({
        status: "reserva_creada",
        booking: booking.booking,
        conversationId: booking.booking.conversationId,
      });
    },
  );

  server.registerTool(
    "comprar_producto",
    {
      title: "Request a product purchase",
      description:
        "Create a pending order request (no payment processing). Contact or client pin required.",
      inputSchema: {
        pin: pinSchema,
        producto: z.string().min(1).max(200).describe("Product name or id"),
        cantidad: z.number().int().min(1).max(999).default(1).describe("Quantity"),
        nombreCliente: z.string().min(1).max(80).describe("Buyer name"),
        contacto: z.string().max(160).optional().describe("Phone or email"),
        pinCliente: z.string().max(64).optional().describe("Client OniPin pin if any"),
        contactoRechazado: z.boolean().optional().describe("Client declined sharing contact"),
        notas: z.string().max(1000).optional().describe("Notes"),
        conversationId: z.string().optional().describe("Existing thread"),
      },
      annotations: { ...writeSideEffect, title: "Request a product purchase" },
    },
    async ({
      pin,
      producto,
      cantidad,
      nombreCliente,
      contacto,
      pinCliente,
      contactoRechazado,
      notas,
      conversationId,
    }) => {
      const order = await api(`/v1/orders/${encodeURIComponent(pin)}`, {
        method: "POST",
        body: JSON.stringify({
          productName: producto,
          quantity: cantidad,
          clientName: nombreCliente,
          clientContact: contacto,
          callerPin: pinCliente,
          contactDeclined: contactoRechazado,
          notes: notas,
          conversationId: conversationId || undefined,
        }),
      });
      return jsonContent({
        status: "pedido_creado",
        order: order.order,
        conversationId: order.order.conversationId,
      });
    },
  );

  server.registerResource(
    "perfil",
    new ResourceTemplate("onipin://{pin}/perfil", { list: undefined }),
    {
      title: "Business profile",
      description: "Discovery document for a pin.",
      mimeType: "application/json",
    },
    async (uri, { pin }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await api(`/v1/ping/${encodeURIComponent(pin)}`), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "catalogo",
    new ResourceTemplate("onipin://{pin}/catalogo", { list: undefined }),
    {
      title: "Business catalog",
      description: "Active products and services for a pin.",
      mimeType: "application/json",
    },
    async (uri, { pin }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await api(`/v1/catalog/${encodeURIComponent(pin)}`), null, 2),
        },
      ],
    }),
  );

  server.registerPrompt(
    "atender_como_cliente",
    {
      title: "Act as the customer's agent",
      description: "Guide the assistant to interact with an OniPin business on the user's behalf.",
      argsSchema: {
        pin: z.string().describe("Business pin"),
        objetivo: z.string().describe("What the user wants (buy, book, ask…)"),
      },
    },
    ({ pin, objetivo }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Act as my representative with OniPin business pin ${pin}. Goal: ${objetivo}.
1. Use buscar_negocio and obtener_catalogo when useful.
2. Chat with enviar_mensaje; keep conversationId.
3. Use crear_reserva or comprar_producto when needed.
4. Use leer_conversacion before concluding.
Summarize what was done and what is still pending.`,
          },
        },
      ],
    }),
  );

  return server;
}

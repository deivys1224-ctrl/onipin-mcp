/**
 * OniPin MCP — servidor Model Context Protocol.
 * Cada tool reutiliza la API pública /v1 (sin duplicar lógica ni credenciales):
 * las conversaciones creadas aquí aparecen en CHATS como "Agente de IA".
 *
 * Tool names use domain.action (Smithery / MCP best practice).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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

/** Shared output schema: named fields (required for Smithery output-schema scoring). */
const toolOutputSchema = {
  ok: z.boolean().describe("true if the OniPin API call succeeded"),
  tool: z.string().describe("Canonical tool name that produced this result"),
  summary: z.string().describe("Short human-readable summary for the agent"),
  pin: z.string().optional().describe("Business pin when applicable"),
  conversationId: z.string().optional().describe("Chat conversation id when applicable"),
  status: z.string().optional().describe("High-level status code when applicable"),
  businessName: z.string().optional().describe("Business display name when known"),
  itemCount: z.number().int().optional().describe("Catalog item count when applicable"),
  messageCount: z.number().int().optional().describe("Message count when applicable"),
};

function toolResult({ tool, data, summary, pin, conversationId, status, businessName, itemCount, messageCount }) {
  const structuredContent = {
    ok: true,
    tool,
    summary,
    ...(pin ? { pin } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(status ? { status } : {}),
    ...(businessName ? { businessName } : {}),
    ...(itemCount != null ? { itemCount } : {}),
    ...(messageCount != null ? { messageCount } : {}),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent,
  };
}

const pinSchema = z
  .string()
  .regex(/^onp_[a-z0-9]{8,32}$/, "Pin OniPin con formato onp_xxxxxxxx")
  .describe("Pin único del negocio (ej. onp_vuzadcjv3xw7)");

const READ_EXTERNAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const WRITE_EXTERNAL = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const INSTRUCTIONS = `OniPin MCP connects AI agents to businesses via public pins (onp_…).
Typical flow:
1) discover.from_url or business.lookup to identify the business
2) protocol.handshake (optional) with intent
3) catalog.list before buying; chat.send to converse (keep conversationId)
4) booking.create or order.create for requests (pending business approval)
5) chat.read to poll owner replies when mode is human
Use domain.action tool names (business.lookup, chat.send, …).`;

export function createOniPinMcpServer() {
  const server = new McpServer(
    {
      name: "onipin",
      version: "0.2.0",
      title: "OniPin",
      websiteUrl: "https://onnivers.store",
    },
    { instructions: INSTRUCTIONS },
  );

  /* ------------------------------- tools ------------------------------- */

  server.registerTool(
    "discover.from_url",
    {
      title: "Discover OniPin pin from a website URL",
      description:
        "Resolve an OniPin business pin from a website URL (meta name=onipin, llms.txt, well-known). Call when the user shares a site without a pin.",
      inputSchema: {
        url: z.string().url().describe("Business website URL, e.g. https://onnivers.store/probar-chat/"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...READ_EXTERNAL, title: "Discover OniPin pin from a website URL" },
    },
    async ({ url }) => {
      const data = await api(`/v1/discover?url=${encodeURIComponent(url)}`);
      return toolResult({
        tool: "discover.from_url",
        data,
        summary: data.pin ? `Resolved pin ${data.pin}` : "Discovery response",
        pin: data.pin || undefined,
        businessName: data.name || data.business || undefined,
      });
    },
  );

  server.registerTool(
    "protocol.handshake",
    {
      title: "Handshake with an OniPin business",
      description:
        "Optional greeting announcing your agent and intent before chat (appointment.create, order.create, business.chat…). Recommended before the first message.",
      inputSchema: {
        pin: pinSchema,
        intent: z
          .string()
          .optional()
          .describe("Intent: appointment.create, order.create, business.chat, product.price, etc."),
        agente: z.string().max(80).optional().describe("External agent name, e.g. Claude"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...WRITE_EXTERNAL, title: "Handshake with an OniPin business" },
    },
    async ({ pin, intent, agente }) => {
      const data = await api(`/v1/handshake/${encodeURIComponent(pin)}`, {
        method: "POST",
        body: JSON.stringify({
          intent: intent || "business.chat",
          agent: { name: agente || "Agente MCP", version: "0.2" },
        }),
      });
      return toolResult({
        tool: "protocol.handshake",
        data,
        summary: `Handshake ${data.handshake || "done"} for ${pin}`,
        pin,
        status: data.handshake || undefined,
      });
    },
  );

  server.registerTool(
    "business.lookup",
    {
      title: "Look up an OniPin business",
      description:
        "Discovery for a pin: business name, description, language, capabilities and endpoints. Call before chatting to know who you are talking to.",
      inputSchema: { pin: pinSchema },
      outputSchema: toolOutputSchema,
      annotations: { ...READ_EXTERNAL, title: "Look up an OniPin business" },
    },
    async ({ pin }) => {
      const data = await api(`/v1/ping/${encodeURIComponent(pin)}`);
      return toolResult({
        tool: "business.lookup",
        data,
        summary: `Business ${data.name || pin} (${data.botName || "bot"})`,
        pin,
        businessName: data.name || undefined,
      });
    },
  );

  server.registerTool(
    "chat.send",
    {
      title: "Send a chat message to a business",
      description:
        "Send a chat message to the business. Returns conversationId — pass it on later turns. If the owner took over (human mode), reply may be null: use chat.read.",
      inputSchema: {
        pin: pinSchema,
        mensaje: z.string().min(1).max(4000).describe("Message text to send"),
        conversationId: z.string().optional().describe("Existing conversation id to continue the thread"),
        nombre: z.string().max(80).optional().describe("Your display name, e.g. Claude agent"),
        intent: z
          .string()
          .optional()
          .describe("OniPin 0.2 intent: appointment.create, order.create, business.chat, product.price…"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...WRITE_EXTERNAL, title: "Send a chat message to a business" },
    },
    async ({ pin, mensaje, conversationId, nombre, intent }) => {
      const data = await api(`/v1/chat/${encodeURIComponent(pin)}`, {
        method: "POST",
        headers: {
          ...(intent ? { "X-Oni-Intent": intent } : {}),
          ...(nombre ? { "X-Oni-Agent": nombre } : {}),
        },
        body: JSON.stringify({
          message: mensaje,
          conversationId: conversationId || undefined,
          callerName: nombre || "Agente MCP",
          agent: { name: nombre || "Agente MCP", version: "0.2" },
          intent: intent || undefined,
        }),
      });
      const replyText = data.reply?.text || data.reply || null;
      return toolResult({
        tool: "chat.send",
        data,
        summary: replyText
          ? `Reply received (${String(replyText).slice(0, 80)}…)`
          : "Message sent; waiting for reply (try chat.read)",
        pin,
        conversationId: data.conversationId || conversationId,
        businessName: data.data?.business?.name || undefined,
      });
    },
  );

  server.registerTool(
    "chat.read",
    {
      title: "Read conversation messages",
      description:
        "Read messages in an existing conversation (bot and human owner). Use after (ISO timestamp) for only new messages.",
      inputSchema: {
        pin: pinSchema,
        conversationId: z.string().min(8).describe("Conversation id from chat.send"),
        after: z.string().optional().describe("Only messages after this ISO timestamp"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...READ_EXTERNAL, title: "Read conversation messages" },
    },
    async ({ pin, conversationId, after }) => {
      const qs = after ? `?after=${encodeURIComponent(after)}` : "";
      const data = await api(
        `/v1/chat/${encodeURIComponent(pin)}/${encodeURIComponent(conversationId)}/messages${qs}`,
      );
      const messages = data.messages || data.items || [];
      return toolResult({
        tool: "chat.read",
        data,
        summary: `${Array.isArray(messages) ? messages.length : 0} message(s)`,
        pin,
        conversationId,
        messageCount: Array.isArray(messages) ? messages.length : undefined,
      });
    },
  );

  server.registerTool(
    "catalog.list",
    {
      title: "Get product catalog",
      description:
        "List active products and services: name, description, price, kind and image. Call before order.create.",
      inputSchema: { pin: pinSchema },
      outputSchema: toolOutputSchema,
      annotations: { ...READ_EXTERNAL, title: "Get product catalog" },
    },
    async ({ pin }) => {
      const data = await api(`/v1/catalog/${encodeURIComponent(pin)}`);
      const items = data.items || data.products || [];
      return toolResult({
        tool: "catalog.list",
        data,
        summary: `${Array.isArray(items) ? items.length : 0} catalog item(s)`,
        pin,
        businessName: data.business || undefined,
        itemCount: Array.isArray(items) ? items.length : undefined,
      });
    },
  );

  server.registerTool(
    "booking.create",
    {
      title: "Request a booking",
      description:
        "Create a pending booking/appointment request in the business CHATS inbox. Phone or email is required unless the client has an OniPin pin.",
      inputSchema: {
        pin: pinSchema,
        servicio: z.string().min(1).max(200).describe("Service or reason for the booking"),
        fecha: z.string().min(1).max(80).describe("Desired date/time, e.g. 2026-07-20 15:00"),
        nombreCliente: z.string().min(1).max(80).describe("Client name"),
        contacto: z
          .string()
          .max(160)
          .optional()
          .describe("Phone or email (required if client has no OniPin pin)"),
        pinCliente: z.string().max(64).optional().describe("Client OniPin pin if any"),
        contactoRechazado: z
          .boolean()
          .optional()
          .describe("true if client with pin declined sharing phone/email"),
        notas: z.string().max(1000).optional().describe("Extra notes"),
        conversationId: z.string().optional().describe("Existing thread id"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...WRITE_EXTERNAL, title: "Request a booking" },
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
      const data = {
        status: "reserva_creada",
        booking: booking.booking,
        conversationId: booking.booking?.conversationId,
        aviso:
          "La solicitud quedó pendiente de aprobación. El cliente y el negocio verán el aviso en el chat.",
      };
      return toolResult({
        tool: "booking.create",
        data,
        summary: `Booking requested: ${servicio} @ ${fecha}`,
        pin,
        conversationId: booking.booking?.conversationId,
        status: "reserva_creada",
      });
    },
  );

  server.registerTool(
    "order.create",
    {
      title: "Request a product purchase",
      description:
        "Create a pending order request (no card processing). Phone or email required unless client has a pin. Call catalog.list first.",
      inputSchema: {
        pin: pinSchema,
        producto: z.string().min(1).max(200).describe("Product name or id from catalog"),
        cantidad: z.number().int().min(1).max(999).default(1).describe("Quantity"),
        nombreCliente: z.string().min(1).max(80).describe("Buyer name"),
        contacto: z
          .string()
          .max(160)
          .optional()
          .describe("Phone or email (required if client has no OniPin pin)"),
        pinCliente: z.string().max(64).optional().describe("Client OniPin pin if any"),
        contactoRechazado: z
          .boolean()
          .optional()
          .describe("true if client with pin declined sharing phone/email"),
        notas: z.string().max(1000).optional().describe("Address, size, color…"),
        conversationId: z.string().optional().describe("Existing thread id"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...WRITE_EXTERNAL, title: "Request a product purchase" },
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
      const data = {
        status: "pedido_creado",
        order: order.order,
        conversationId: order.order?.conversationId,
        aviso:
          "El pedido quedó pendiente de aprobación. El cliente y el negocio verán el aviso en el chat.",
      };
      return toolResult({
        tool: "order.create",
        data,
        summary: `Order requested: ${producto} x${cantidad}`,
        pin,
        conversationId: order.order?.conversationId,
        status: "pedido_creado",
      });
    },
  );

  /* ----------------------------- resources ----------------------------- */

  server.registerResource(
    "perfil",
    new ResourceTemplate("onipin://{pin}/perfil", { list: undefined }),
    {
      title: "Perfil del negocio",
      description: "Documento de discovery del pin (nombre, capacidades, endpoints).",
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
      title: "Catálogo del negocio",
      description: "Productos y servicios activos del pin.",
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

  /* ------------------------------ prompts ------------------------------ */

  server.registerPrompt(
    "atender_como_cliente",
    {
      title: "Actuar como cliente del negocio",
      description:
        "Guía al asistente para interactuar con un negocio OniPin en nombre del usuario.",
      argsSchema: {
        pin: z.string().describe("Pin del negocio"),
        objetivo: z.string().describe("Qué quiere lograr el usuario (comprar, reservar, preguntar…)"),
      },
    },
    ({ pin, objetivo }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Actúa como mi representante ante el negocio OniPin con pin ${pin}. Objetivo: ${objetivo}.
1. Usa business.lookup para conocer el negocio y catalog.list si aplica.
2. Conversa con chat.send, guardando el conversationId para mantener el hilo.
3. Si hay que reservar usa booking.create; si hay que comprar usa order.create.
4. Verifica respuestas del dueño con chat.read antes de darme conclusiones.
Resume al final qué se logró y qué queda pendiente.`,
          },
        },
      ],
    }),
  );

  return server;
}

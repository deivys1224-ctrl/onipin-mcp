/**
 * OniPin MCP — servidor Model Context Protocol.
 * Cada tool reutiliza la API pública /v1 (sin duplicar lógica ni credenciales):
 * las conversaciones creadas aquí aparecen en CHATS como "Agente de IA".
 *
 * Tool names use underscores only (Claude / ChatGPT / Cursor compatible).
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

/**
 * Resolve a business pin from pin | username | url (priority in that order).
 * Throws a clear Error on missing input or 404.
 */
async function resolveBusinessPin({ pin, username, url }) {
  if (pin) return pin;

  if (username) {
    const handle = String(username).trim().toLowerCase().replace(/^@+/, "");
    if (!handle) throw new Error("username vacío");
    const data = await api(`/v1/discover?username=${encodeURIComponent(handle)}`);
    if (!data.found || !data.pin) {
      throw new Error(`Negocio no encontrado para @${handle}`);
    }
    return data.pin;
  }

  if (url) {
    const data = await api(`/v1/discover?url=${encodeURIComponent(url)}`);
    if (!data.found || !data.pin) {
      throw new Error(
        data.error === "pin_not_registered"
          ? `Pin descubierto en la URL pero no registrado (${data.pin || "?"})`
          : "Negocio no encontrado en esa URL (404)",
      );
    }
    return data.pin;
  }

  return null;
}

async function searchBusinesses({ telefono, categoria, ciudad }) {
  const qs = new URLSearchParams();
  if (telefono) qs.set("telefono", telefono);
  if (categoria) qs.set("categoria", categoria);
  if (ciudad) qs.set("ciudad", ciudad);
  return api(`/v1/discover/search?${qs.toString()}`);
}

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
1) business_lookup (pin, @username, url, telefono, categoria, ciudad) or discover_from_url
2) protocol_handshake (optional) with intent
3) catalog_list before buying; chat_send to converse (keep conversationId)
4) booking_create or order_create for requests (pending business approval)
5) chat_read to poll owner replies when mode is human
Tool names use underscores only (Claude/ChatGPT/Cursor compatible): business_lookup, chat_send, …`;

/** Compact OniPin mark (same as /icon.svg) for MCP clients that read serverInfo.icons */
const ICON_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9Ik9uaVBpbiI+IDxkZWZzPiA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+IDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwYTE2MjgiLz4gPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDYxMDE4Ii8+IDwvbGluZWFyR3JhZGllbnQ+IDxyYWRpYWxHcmFkaWVudCBpZD0ibmVidWxhIiBjeD0iMzUlIiBjeT0iMzAlIiByPSI3MCUiPiA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMjJkM2VlIiBzdG9wLW9wYWNpdHk9IjAuNTUiLz4gPHN0b3Agb2Zmc2V0PSI0NSUiIHN0b3AtY29sb3I9IiM2MzY2ZjEiIHN0b3Atb3BhY2l0eT0iMC4zNSIvPiA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwYTE2MjgiIHN0b3Atb3BhY2l0eT0iMCIvPiA8L3JhZGlhbEdyYWRpZW50PiA8bGluZWFyR3JhZGllbnQgaWQ9InBpbiIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPiA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNjdlOGY5Ii8+IDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzA2YjZkNCIvPiA8L2xpbmVhckdyYWRpZW50PiA8L2RlZnM+IDxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiByeD0iOTYiIGZpbGw9InVybCgjYmcpIi8+IDxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiByeD0iOTYiIGZpbGw9InVybCgjbmVidWxhKSIvPiA8Y2lyY2xlIGN4PSIxNDAiIGN5PSIxMjAiIHI9IjMiIGZpbGw9IiNlMGYyZmUiIG9wYWNpdHk9IjAuOSIvPiA8Y2lyY2xlIGN4PSIzODAiIGN5PSIxNjAiIHI9IjIiIGZpbGw9IiNhNWYzZmMiIG9wYWNpdHk9IjAuOCIvPiA8Y2lyY2xlIGN4PSI0MjAiIGN5PSIzMjAiIHI9IjIuNSIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iMC43Ii8+IDxjaXJjbGUgY3g9IjEwMCIgY3k9IjM2MCIgcj0iMiIgZmlsbD0iI2NmZmFmZSIgb3BhY2l0eT0iMC43NSIvPiA8cGF0aCBmaWxsPSJ1cmwoI3BpbikiIGQ9Ik0yNTYgNzJjLTYyIDAtMTEyIDQ4LTExMiAxMTAgMCA4MiA5NiAyMTAgMTA0IDIyMmExMCAxMCAwIDAgMCAxNiAwYzgtMTIgMTA0LTE0MCAxMDQtMjIyIDAtNjItNTAtMTEwLTExMi0xMTB6bTAgMTU4YTQ4IDQ4IDAgMSAxIDAtOTYgNDggNDggMCAwIDEgMCA5NnoiLz4gPGNpcmNsZSBjeD0iMjU2IiBjeT0iMTgyIiByPSIyMiIgZmlsbD0iIzBhMTYyOCIvPiA8Y2lyY2xlIGN4PSIyNTYiIGN5PSIxODIiIHI9IjEwIiBmaWxsPSIjNjdlOGY5Ii8+IDwvc3ZnPg==";

export function createOniPinMcpServer() {
  const server = new McpServer(
    {
      name: "onipin",
      version: "0.2.4",
      title: "OniPin",
      websiteUrl: "https://onnivers.store",
      icons: [
        {
          src: ICON_DATA_URI,
          mimeType: "image/svg+xml",
          sizes: ["any"],
        },
        {
          src: "https://onnivers.store/icon.svg",
          mimeType: "image/svg+xml",
          sizes: ["512x512"],
        },
      ],
    },
    { instructions: INSTRUCTIONS },
  );

  /* ------------------------------- tools ------------------------------- */

  server.registerTool(
    "discover_from_url",
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
        tool: "discover_from_url",
        data,
        summary: data.pin ? `Resolved pin ${data.pin}` : "Discovery response",
        pin: data.pin || undefined,
        businessName: data.name || data.business || undefined,
      });
    },
  );

  server.registerTool(
    "protocol_handshake",
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
        tool: "protocol_handshake",
        data,
        summary: `Handshake ${data.handshake || "done"} for ${pin}`,
        pin,
        status: data.handshake || undefined,
      });
    },
  );

  server.registerTool(
    "business_lookup",
    {
      title: "Look up an OniPin business",
      description:
        "Discovery by pin, @username, url, phone, category and/or city. Exact lookup (pin/username/url) returns one business; category/city/phone can return a list. Example: { categoria: \"barbería\", ciudad: \"Valledupar\" }.",
      inputSchema: {
        pin: pinSchema.optional().describe("Business pin (onp_…). Highest priority if provided."),
        username: z
          .string()
          .min(1)
          .max(32)
          .optional()
          .describe("Public @username without requiring the @ (case-insensitive)"),
        url: z
          .string()
          .url()
          .optional()
          .describe("Business website URL — resolves via well-known / meta / llms.txt"),
        telefono: z
          .string()
          .min(5)
          .max(40)
          .optional()
          .describe(
            "Phone number to find the business (e.g. +573117486855 or 3117486855). Matches with or without country code.",
          ),
        categoria: z
          .string()
          .min(2)
          .max(80)
          .optional()
          .describe("Category or free-text topic (e.g. barbería, technology, restaurante)"),
        ciudad: z
          .string()
          .min(2)
          .max(80)
          .optional()
          .describe("City filter (e.g. Valledupar, Bogotá)"),
      },
      outputSchema: toolOutputSchema,
      annotations: { ...READ_EXTERNAL, title: "Look up an OniPin business" },
    },
    async ({ pin, username, url, telefono, categoria, ciudad }) => {
      const resolvedPin = await resolveBusinessPin({ pin, username, url });
      if (resolvedPin) {
        const data = await api(`/v1/ping/${encodeURIComponent(resolvedPin)}`);
        return toolResult({
          tool: "business_lookup",
          data,
          summary: `Business ${data.name || resolvedPin} (${data.botName || "bot"})`,
          pin: resolvedPin,
          businessName: data.name || undefined,
        });
      }

      if (telefono || categoria || ciudad) {
        const data = await searchBusinesses({ telefono, categoria, ciudad });
        if (!data.found || !data.count) {
          throw new Error("Ningún negocio coincide con esa búsqueda (404)");
        }
        if (data.count === 1 && data.items?.[0]?.pin) {
          const full = await api(`/v1/ping/${encodeURIComponent(data.items[0].pin)}`);
          return toolResult({
            tool: "business_lookup",
            data: { ...full, search: data },
            summary: `Business ${full.name || data.items[0].pin} (${full.botName || "bot"})`,
            pin: data.items[0].pin,
            businessName: full.name || data.items[0].name || undefined,
            itemCount: 1,
          });
        }
        return toolResult({
          tool: "business_lookup",
          data,
          summary: `${data.count} negocios encontrados`,
          itemCount: data.count,
          businessName: data.items?.[0]?.name || undefined,
          pin: data.items?.[0]?.pin || undefined,
        });
      }

      throw new Error("Indica pin, username, url, telefono, categoria o ciudad");
    },
  );

  server.registerTool(
    "chat_send",
    {
      title: "Send a chat message to a business",
      description:
        "Send a chat message to the business. Returns conversationId — pass it on later turns. If the owner took over (human mode), reply may be null: use chat_read.",
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
        tool: "chat_send",
        data,
        summary: replyText
          ? `Reply received (${String(replyText).slice(0, 80)}…)`
          : "Message sent; waiting for reply (try chat_read)",
        pin,
        conversationId: data.conversationId || conversationId,
        businessName: data.data?.business?.name || undefined,
      });
    },
  );

  server.registerTool(
    "chat_read",
    {
      title: "Read conversation messages",
      description:
        "Read messages in an existing conversation (bot and human owner). Use after (ISO timestamp) for only new messages.",
      inputSchema: {
        pin: pinSchema,
        conversationId: z.string().min(8).describe("Conversation id from chat_send"),
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
        tool: "chat_read",
        data,
        summary: `${Array.isArray(messages) ? messages.length : 0} message(s)`,
        pin,
        conversationId,
        messageCount: Array.isArray(messages) ? messages.length : undefined,
      });
    },
  );

  server.registerTool(
    "catalog_list",
    {
      title: "Get product catalog",
      description:
        "List active products and services: name, description, price, kind and image. Call before order_create.",
      inputSchema: { pin: pinSchema },
      outputSchema: toolOutputSchema,
      annotations: { ...READ_EXTERNAL, title: "Get product catalog" },
    },
    async ({ pin }) => {
      const data = await api(`/v1/catalog/${encodeURIComponent(pin)}`);
      const items = data.items || data.products || [];
      return toolResult({
        tool: "catalog_list",
        data,
        summary: `${Array.isArray(items) ? items.length : 0} catalog item(s)`,
        pin,
        businessName: data.business || undefined,
        itemCount: Array.isArray(items) ? items.length : undefined,
      });
    },
  );

  server.registerTool(
    "booking_create",
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
        tool: "booking_create",
        data,
        summary: `Booking requested: ${servicio} @ ${fecha}`,
        pin,
        conversationId: booking.booking?.conversationId,
        status: "reserva_creada",
      });
    },
  );

  server.registerTool(
    "order_create",
    {
      title: "Request a product purchase",
      description:
        "Create a pending order request (no card processing). Phone or email required unless client has a pin. Call catalog_list first.",
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
        tool: "order_create",
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
1. Usa business_lookup para conocer el negocio y catalog_list si aplica.
2. Conversa con chat_send, guardando el conversationId para mantener el hilo.
3. Si hay que reservar usa booking_create; si hay que comprar usa order_create.
4. Verifica respuestas del dueño con chat_read antes de darme conclusiones.
Resume al final qué se logró y qué queda pendiente.`,
          },
        },
      ],
    }),
  );

  return server;
}

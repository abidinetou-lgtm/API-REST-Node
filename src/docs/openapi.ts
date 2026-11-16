import { z } from "zod";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "../schemas/auth.schema.js";
import { listAuditLogsSchema } from "../schemas/audit.schema.js";
import {
  createTicketSchema,
  listTicketsSchema,
  ticketIdSchema,
  updateStatusSchema,
} from "../schemas/ticket.schema.js";
import { changeRoleSchema, createUserSchema, listUsersSchema, userIdSchema } from "../schemas/user.schema.js";
import { ADMIN_ROLES, STAFF_ROLES } from "../utils/roles.js";
import {
  auditLogSchema,
  createdUserSchema,
  currentUserSchema,
  errorSchema,
  healthSchema,
  messageSchema,
  paginatedSchema,
  sessionSchema,
  ticketSchema,
  userSchema,
} from "./response.schemas.js";
import type { Role } from "../generated/prisma/enums.js";

type Method = "get" | "post" | "patch";
type Access = "public" | "refresh-cookie" | Role[] | "authenticated";

export type RouteDoc = {
  method: Method;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: { status: number; description: string; schema?: z.ZodType };
  errors: number[];
};

// Every route of the API. A test checks that this list matches the routes really declared.
export const routeDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/health",
    operationId: "getHealth",
    tag: "Health",
    summary: "Check that the API is running",
    access: "public",
    response: { status: 200, description: "The API is running", schema: healthSchema },
    errors: [],
  },
  {
    method: "post",
    path: "/auth/login",
    operationId: "login",
    tag: "Auth",
    summary: "Log in with email and password",
    description:
      "Returns an access token and sets the refresh token in an httpOnly cookie. " +
      "Limited to 10 failed attempts per IP address and 5 per account every 15 minutes.",
    access: "public",
    body: loginSchema,
    response: { status: 200, description: "Logged in", schema: sessionSchema },
    errors: [400, 401, 403, 429],
  },
  {
    method: "post",
    path: "/auth/refresh",
    operationId: "refreshSession",
    tag: "Auth",
    summary: "Get a new access token",
    description:
      "Uses the refresh token cookie and replaces it with a new one. " +
      "Reusing an old refresh token closes every session of the account.",
    access: "refresh-cookie",
    response: { status: 200, description: "New session", schema: sessionSchema },
    errors: [401],
  },
  {
    method: "post",
    path: "/auth/logout",
    operationId: "logout",
    tag: "Auth",
    summary: "Log out",
    description: "Revokes the refresh token and deletes the cookie. Always succeeds.",
    access: "refresh-cookie",
    response: { status: 204, description: "Logged out" },
    errors: [],
  },
  {
    method: "post",
    path: "/auth/accept-invitation",
    operationId: "acceptInvitation",
    tag: "Auth",
    summary: "Accept an invitation and choose a password",
    description: "The token comes from the invitation email. It is valid 48 hours and can only be used once.",
    access: "public",
    body: acceptInvitationSchema,
    response: { status: 204, description: "Password set, the account can log in" },
    errors: [400, 403, 429],
  },
  {
    method: "post",
    path: "/auth/forgot-password",
    operationId: "forgotPassword",
    tag: "Auth",
    summary: "Ask for a password reset email",
    description: "Same answer whether the account exists or not.",
    access: "public",
    body: forgotPasswordSchema,
    response: { status: 200, description: "Request received", schema: messageSchema },
    errors: [400, 429],
  },
  {
    method: "post",
    path: "/auth/reset-password",
    operationId: "resetPassword",
    tag: "Auth",
    summary: "Choose a new password",
    description:
      "The token comes from the reset email. It is valid 30 minutes and can only be used once. " +
      "Every session of the account is closed.",
    access: "public",
    body: resetPasswordSchema,
    response: { status: 204, description: "Password changed" },
    errors: [400, 403, 429],
  },
  {
    method: "get",
    path: "/auth/me",
    operationId: "getCurrentUser",
    tag: "Auth",
    summary: "Get the logged in user",
    access: "authenticated",
    response: { status: 200, description: "The logged in user", schema: currentUserSchema },
    errors: [401],
  },
  {
    method: "post",
    path: "/users",
    operationId: "createUser",
    tag: "Users",
    summary: "Create an account and send the invitation",
    access: ["SUPER_ADMIN"],
    body: createUserSchema,
    response: { status: 201, description: "Account created", schema: createdUserSchema },
    errors: [400, 401, 403, 409],
  },
  {
    method: "get",
    path: "/users",
    operationId: "listUsers",
    tag: "Users",
    summary: "List the accounts",
    access: ADMIN_ROLES,
    query: listUsersSchema,
    response: { status: 200, description: "One page of accounts", schema: paginatedSchema(userSchema) },
    errors: [400, 401, 403],
  },
  {
    method: "get",
    path: "/users/:id",
    operationId: "getUser",
    tag: "Users",
    summary: "Get an account",
    access: ADMIN_ROLES,
    params: userIdSchema,
    response: { status: 200, description: "The account", schema: userSchema },
    errors: [400, 401, 403, 404],
  },
  {
    method: "post",
    path: "/users/:id/resend-invitation",
    operationId: "resendInvitation",
    tag: "Users",
    summary: "Send the invitation again",
    description: "The previous link stops working.",
    access: ["SUPER_ADMIN"],
    params: userIdSchema,
    response: { status: 204, description: "Invitation sent" },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: "patch",
    path: "/users/:id/disable",
    operationId: "disableUser",
    tag: "Users",
    summary: "Disable an account",
    description:
      "The account is blocked immediately and its sessions are closed. " +
      "An admin can only manage agents and users. Nobody can disable their own account.",
    access: ADMIN_ROLES,
    params: userIdSchema,
    response: { status: 200, description: "The disabled account", schema: userSchema },
    errors: [400, 401, 403, 404],
  },
  {
    method: "patch",
    path: "/users/:id/enable",
    operationId: "enableUser",
    tag: "Users",
    summary: "Enable an account again",
    description: "An admin can only manage agents and users.",
    access: ADMIN_ROLES,
    params: userIdSchema,
    response: { status: 200, description: "The enabled account", schema: userSchema },
    errors: [400, 401, 403, 404],
  },
  {
    method: "patch",
    path: "/users/:id/role",
    operationId: "changeUserRole",
    tag: "Users",
    summary: "Change the role of an account",
    description: "Applies immediately. Nobody can change their own role or become super admin through the API.",
    access: ["SUPER_ADMIN"],
    params: userIdSchema,
    body: changeRoleSchema,
    response: { status: 200, description: "The updated account", schema: userSchema },
    errors: [400, 401, 403, 404],
  },
  {
    method: "get",
    path: "/audit-logs",
    operationId: "listAuditLogs",
    tag: "Audit logs",
    summary: "List the sensitive actions",
    description: "Newest first by default. Audit logs cannot be modified or deleted.",
    access: ["SUPER_ADMIN"],
    query: listAuditLogsSchema,
    response: { status: 200, description: "One page of audit logs", schema: paginatedSchema(auditLogSchema) },
    errors: [400, 401, 403],
  },
  {
    method: "post",
    path: "/tickets",
    operationId: "createTicket",
    tag: "Tickets",
    summary: "Create a ticket",
    description: "The ticket is OPEN and belongs to the logged in user.",
    access: "authenticated",
    body: createTicketSchema,
    response: { status: 201, description: "Ticket created", schema: ticketSchema },
    errors: [400, 401],
  },
  {
    method: "get",
    path: "/tickets",
    operationId: "listTickets",
    tag: "Tickets",
    summary: "List the tickets",
    description: "A user only sees their own tickets, whatever the filters. The support team sees every ticket.",
    access: "authenticated",
    query: listTicketsSchema,
    response: { status: 200, description: "One page of tickets", schema: paginatedSchema(ticketSchema) },
    errors: [400, 401],
  },
  {
    method: "get",
    path: "/tickets/:id",
    operationId: "getTicket",
    tag: "Tickets",
    summary: "Get a ticket",
    description: "A user asking for the ticket of someone else gets 404.",
    access: "authenticated",
    params: ticketIdSchema,
    response: { status: 200, description: "The ticket", schema: ticketSchema },
    errors: [400, 401, 404],
  },
  {
    method: "patch",
    path: "/tickets/:id/status",
    operationId: "updateTicketStatus",
    tag: "Tickets",
    summary: "Change the status of a ticket",
    access: STAFF_ROLES,
    params: ticketIdSchema,
    body: updateStatusSchema,
    response: { status: 200, description: "The updated ticket", schema: ticketSchema },
    errors: [400, 401, 403, 404],
  },
];

const errorDescriptions: Record<number, string> = {
  400: "Invalid data (VALIDATION_FAILED, INVALID_TOKEN...)",
  401: "Not logged in or invalid credentials",
  403: "Not allowed for this role, or account disabled",
  404: "Not found",
  409: "Conflict with the current state",
  429: "Too many requests, try again later",
};

const roleNames: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  AGENT: "Agent",
  USER: "User",
};

type JsonSchema = {
  properties?: Record<string, JsonSchema & { description?: string }>;
  required?: string[];
  [key: string]: unknown;
};

function toJsonSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
    // Dates are sent as text in URLs and JSON
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema._zod.def.type === "date") {
        jsonSchema.type = "string";
        jsonSchema.format = "date-time";
      }
    },
  });
  return jsonSchema as JsonSchema;
}

function parameters(schema: z.ZodType | undefined, location: "path" | "query") {
  if (!schema) return [];

  const { properties = {}, required = [] } = toJsonSchema(schema, "input");
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.includes(name),
    description: property.description,
    schema: property,
  }));
}

function json(schema: z.ZodType, io: "input" | "output") {
  return { content: { "application/json": { schema: toJsonSchema(schema, io) } } };
}

function accessText(access: Access) {
  if (access === "public") return "Public.";
  if (access === "refresh-cookie") return "Uses the refresh token cookie.";
  if (access === "authenticated") return "Every logged in user.";
  return `Reserved to: ${access.map((role) => roleNames[role]).join(", ")}.`;
}

function security(access: Access) {
  if (access === "public") return [];
  if (access === "refresh-cookie") return [{ refreshCookie: [] }];
  return [{ bearerAuth: [] }];
}

function operation(route: RouteDoc) {
  const responses: Record<string, unknown> = {
    [route.response.status]: {
      description: route.response.description,
      ...(route.response.schema ? json(route.response.schema, "output") : {}),
    },
  };

  for (const status of route.errors) {
    responses[status] = {
      description: errorDescriptions[status],
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    };
  }

  return {
    operationId: route.operationId,
    tags: [route.tag],
    summary: route.summary,
    description: [accessText(route.access), route.description].filter(Boolean).join("\n\n"),
    security: security(route.access),
    parameters: [...parameters(route.params, "path"), ...parameters(route.query, "query")],
    ...(route.body ? { requestBody: { required: true, ...json(route.body, "input") } } : {}),
    responses,
  };
}

// "/tickets/:id" -> "/tickets/{id}"
function openApiPath(path: string) {
  return path.replace(/:(\w+)/g, "{$1}");
}

function buildDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routeDocs) {
    const path = openApiPath(route.path);
    paths[path] = { ...paths[path], [route.method]: operation(route) };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Support Ticket API",
      version: "1.0.0",
      description:
        "Support ticket management with invitation-only accounts and roles.\n\n" +
        "Log in with `POST /auth/login`, then click **Authorize** and paste the `accessToken`. " +
        "Lists are paginated and return `{ data, meta }`. Errors always return `{ error: { code, message, requestId } }`.",
    },
    tags: [
      { name: "Auth", description: "Login, sessions, invitation and password reset" },
      { name: "Users", description: "Account management" },
      { name: "Tickets", description: "Support tickets" },
      { name: "Audit logs", description: "History of the sensitive actions" },
      { name: "Health", description: "Monitoring" },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        refreshCookie: { type: "apiKey", in: "cookie", name: "refresh_token" },
      },
      schemas: {
        Error: toJsonSchema(errorSchema, "output"),
      },
    },
  };
}

export const openApiDocument = buildDocument();

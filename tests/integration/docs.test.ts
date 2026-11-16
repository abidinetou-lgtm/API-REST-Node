import type { Response } from "supertest";
import { describe, expect, it } from "vitest";
import { apiRouters, app } from "../../src/app.js";
import { routeDocs } from "../../src/docs/openapi.js";
import { errorSchema } from "../../src/docs/response.schemas.js";
import { api, bearer, createUser, loginAs } from "./helpers.js";

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

function declaredRoutes() {
  const routes: string[] = [];
  const collect = (stack: Layer[], prefix: string) => {
    for (const { route } of stack) {
      if (!route) continue;
      for (const method of Object.keys(route.methods)) {
        routes.push(`${method.toUpperCase()} ${prefix}${route.path === "/" ? "" : route.path}`);
      }
    }
  };

  collect((app as unknown as { router: { stack: Layer[] } }).router.stack, "");
  for (const [prefix, router] of Object.entries(apiRouters)) {
    collect(router.stack as unknown as Layer[], prefix);
  }
  return routes.sort();
}

// Fails if the real response does not match the documented one
function expectDocumented(operationId: string, res: Response) {
  const route = routeDocs.find((doc) => doc.operationId === operationId);
  if (!route) throw new Error(`${operationId} is not documented`);

  expect(res.status, operationId).toBe(route.response.status);
  route.response.schema?.parse(res.body);
}

describe("API documentation", () => {
  it("documents every route of the API, and only those", () => {
    const documented = routeDocs.map((route) => `${route.method.toUpperCase()} ${route.path}`).sort();
    expect(documented).toEqual(declaredRoutes());
  });

  it("serves Swagger UI and the OpenAPI file", async () => {
    const file = await api().get("/docs/openapi.json");
    expect(file.status).toBe(200);
    expect(file.body.openapi).toBe("3.1.0");
    expect(Object.keys(file.body.paths)).toContain("/tickets/{id}/status");

    const page = await api().get("/docs/");
    expect(page.status).toBe(200);
    expect(page.text).toContain("swagger-ui");
  });

  it("matches the real responses", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const auth = bearer(token);

    expectDocumented("getHealth", await api().get("/health"));
    expectDocumented("getCurrentUser", await api().get("/auth/me").set(auth));

    const created = await api()
      .post("/users")
      .set(auth)
      .send({ email: "agent@example.com", name: "Karim", role: "AGENT" });
    expectDocumented("createUser", created);
    const userId = created.body.user.id;

    expectDocumented("listUsers", await api().get("/users").set(auth));
    expectDocumented("getUser", await api().get(`/users/${userId}`).set(auth));
    expectDocumented("changeUserRole", await api().patch(`/users/${userId}/role`).set(auth).send({ role: "USER" }));
    expectDocumented("disableUser", await api().patch(`/users/${userId}/disable`).set(auth));
    expectDocumented("enableUser", await api().patch(`/users/${userId}/enable`).set(auth));
    expectDocumented("resendInvitation", await api().post(`/users/${userId}/resend-invitation`).set(auth));

    const ticket = await api()
      .post("/tickets")
      .set(auth)
      .send({ title: "Printer jammed", description: "Paper stuck in tray 2" });
    expectDocumented("createTicket", ticket);
    expectDocumented("listTickets", await api().get("/tickets").set(auth));
    expectDocumented("getTicket", await api().get(`/tickets/${ticket.body.id}`).set(auth));
    expectDocumented(
      "updateTicketStatus",
      await api().patch(`/tickets/${ticket.body.id}/status`).set(auth).send({ status: "CLOSED" }),
    );

    expectDocumented("listAuditLogs", await api().get("/audit-logs").set(auth));
  });

  it("matches the real session and error responses", async () => {
    const user = await createUser();

    const session = await api().post("/auth/login").send({ email: user.email, password: "Str0ngPassw0rd" });
    expectDocumented("login", session);
    expectDocumented("forgotPassword", await api().post("/auth/forgot-password").send({ email: user.email }));

    const notFound = await api().get("/tickets/0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70").set(bearer(session.body.accessToken));
    errorSchema.parse(notFound.body);

    const invalid = await api().post("/tickets").set(bearer(session.body.accessToken)).send({});
    errorSchema.parse(invalid.body);
  });
});

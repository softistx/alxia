import { expect, test } from "bun:test";
import { matchesSpec } from "@alxia/openapi";
import { createHttpClient } from "@nxgt/httpyz";
import { createOpenApiClient } from "@nxgt/openapi-httpyz";
import { app } from "./app";
import { env } from "./env";
import { operations as routes } from "./generated/alxia";
import { operations } from "./generated/operations";

// The client types every call from openapi.yaml (the generated operations
// table) and sends it to the app in-process: no server, no port. A reply is a
// union narrowed on its status; a status the spec does not declare throws.
const http = createHttpClient({
  baseUrl: "http://alxia.test",
  fetch: (request) => app.fetch(request),
  headers: { "x-api-key": env.API_KEY },
});
const api = createOpenApiClient(http, operations);

// The client checks a request against the spec before it sends it. The tests
// that send what the spec refuses turn that off, to see the server refuse it.
const raw = createOpenApiClient(http, operations, {
  validate: { request: false },
});

test("routes every operation of openapi.yaml", () => {
  matchesSpec(app, routes);
});

test("creates a todo from JSON", async () => {
  const reply = await api.op("createTodo", {
    json: { title: "Write a route" },
  });
  expect(reply.status).toBe(201);
  expect(reply.data).toEqual({
    id: expect.any(Number),
    title: "Write a route",
    done: false,
  });
});

test("refuses an empty title with a 400 problem naming it", async () => {
  const reply = await raw.op("createTodo", { json: { title: "" } });
  expect(reply.status).toBe(400);
  expect(reply.response.headers.get("content-type")).toBe(
    "application/problem+json",
  );
  // reply.data is the 201, 400 or 401 body until the status is checked
  if (reply.status !== 400)
    throw new Error(`expected a 400, got ${reply.status}`);
  expect(reply.data).toMatchObject({
    status: 400,
    issues: [{ path: ["title"] }],
  });
});

test("asks for the key before it reads the body", async () => {
  const reply = await raw.op(
    "createTodo",
    { json: { title: "" } },
    { headers: { "x-api-key": "wrong" } },
  );
  expect(reply.status).toBe(401); // requireKey stands before the validation
  expect(reply.data).toEqual({ error: "unauthorized" });
});

test("reads the id from the path as a number, as the spec types it", async () => {
  const created = await api.op("createTodo", { json: { title: "Find me" } });
  if (created.status !== 201) throw new Error("the todo was not created");
  const found = await api.get("/todos/{id}", {
    param: { id: created.data.id },
  });
  if (found.status !== 200) throw new Error("the todo was not found");
  expect(found.data.title).toBe("Find me");
  const missing = await api.get("/todos/{id}", { param: { id: 9999 } });
  expect(missing.status).toBe(404);
  expect(missing.data).toEqual({ error: "not_found" });
  // `id: "first"` is a compile error here; app.request sends what it is told.
  expect((await app.request("/todos/first")).status).toBe(400);
});

test("lists the todos", async () => {
  const reply = await api.get("/todos");
  if (reply.status !== 200) throw new Error(`got a ${reply.status}`);
  expect(Array.isArray(reply.data)).toBe(true);
});

test("answers the liveness probe", async () => {
  const response = await app.request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("app.request is the same app, with a hand-written request", async () => {
  const response = await app.request("/todos");
  expect(response.status).toBe(200);
});

import { expect, test } from "bun:test";
import { matchesSpec } from "@alxia/openapi";
import createClient from "openapi-fetch";
import { app } from "./app";
import { env } from "./env";
import { operations } from "./generated/alxia";
import type { paths } from "./generated/paths";

// The client types every call from openapi.yaml (generated/paths.ts) and
// sends it to the app in-process: no server, no port.
const api = createClient<paths>({
  baseUrl: "http://alxia.test",
  fetch: (request) => app.fetch(request),
  headers: { "x-api-key": env.API_KEY },
});

test("routes every operation of openapi.yaml, and nothing else", () => {
  matchesSpec(app, operations);
});

test("creates a todo from JSON", async () => {
  const { data, response } = await api.POST("/todos", {
    body: { title: "Write a route" },
  });
  expect(response.status).toBe(201);
  expect(data).toEqual({
    id: expect.any(Number),
    title: "Write a route",
    done: false,
  });
});

test("refuses an empty title with a 400 naming it", async () => {
  const { error, response } = await api.POST("/todos", {
    body: { title: "" },
  });
  expect(response.status).toBe(400);
  // error is the 400 or the 401 body: a match, not a property read
  expect(error).toMatchObject({ issues: [{ path: ["title"] }] });
});

test("asks for the key before it reads the body", async () => {
  const { error, response } = await api.POST("/todos", {
    body: { title: "" },
    headers: { "x-api-key": "wrong" },
  });
  expect(response.status).toBe(401); // requireKey stands before the validation
  expect(error).toEqual({ error: "unauthorized" });
});

test("reads the id from the path as a number, as the spec types it", async () => {
  const created = await api.POST("/todos", { body: { title: "Find me" } });
  const id = created.data?.id ?? 0;
  const found = await api.GET("/todos/{id}", { params: { path: { id } } });
  expect(found.data?.title).toBe("Find me");
  const missing = await api.GET("/todos/{id}", {
    params: { path: { id: 9999 } },
  });
  expect(missing.response.status).toBe(404);
  // `id: "first"` is a compile error here; app.request sends what it is told.
  expect((await app.request("/todos/first")).status).toBe(400);
});

test("lists the todos", async () => {
  const { data } = await api.GET("/todos");
  expect(Array.isArray(data)).toBe(true);
});

test("app.request is the same app, with a hand-written request", async () => {
  const response = await app.request("/todos");
  expect(response.status).toBe(200);
});

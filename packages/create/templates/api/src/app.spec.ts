import { expect, test } from "bun:test";
import { matchesSpec } from "@alxia/openapi";
import { app } from "./app";
import { apiKey } from "./context";
import { operations } from "./generated/alxia";

const json = { "content-type": "application/json", "x-api-key": apiKey };

test("routes every operation of openapi.yaml, and nothing else", () => {
  matchesSpec(app, operations);
});

test("creates a todo from JSON", async () => {
  const response = await app.request("/todos", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ title: "Write a route" }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    id: expect.any(Number),
    title: "Write a route",
    done: false,
  });
});

test("refuses an empty title with a 400 naming it", async () => {
  const response = await app.request("/todos", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ title: "" }),
  });
  expect(response.status).toBe(400);
  expect((await response.json()).issues[0].path).toEqual(["title"]);
});

test("asks for the key before it reads the body", async () => {
  const response = await app.request("/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "" }),
  });
  expect(response.status).toBe(401); // requireKey stands before the validation
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("reads the id from the path as a number, as the spec types it", async () => {
  const created = await app.request("/todos", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ title: "Find me" }),
  });
  const { id } = await created.json();
  const found = await app.request(`/todos/${id}`);
  expect(found.status).toBe(200);
  expect((await found.json()).title).toBe("Find me");
  expect((await app.request("/todos/9999")).status).toBe(404);
  expect((await app.request("/todos/first")).status).toBe(400);
});

test("lists the todos", async () => {
  const response = await app.request("/todos");
  expect(response.status).toBe(200);
  expect(Array.isArray(await response.json())).toBe(true);
});

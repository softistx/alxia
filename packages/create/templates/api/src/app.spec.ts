import { expect, test } from "bun:test";
import { apiKey, app } from "./app";

const json = { "content-type": "application/json", "x-api-key": apiKey };

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
  expect(response.status).toBe(401); // requireKey stands before validate
});

test("answers 401 with the error a client reads", async () => {
  const response = await app.request("/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "No key" }),
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

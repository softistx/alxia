import { expect, test } from "bun:test";
import { app } from "./index";

test("GET / says hello", async () => {
  const response = await app.request("/");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hello: "world" });
});

test("a path no route has is a 404", async () => {
  expect((await app.request("/nowhere")).status).toBe(404);
});

import { expect, test } from "bun:test";
import { health } from "@alxia/core";
import { createBase } from "./context";

// A server whose every connection comes from `peer`: app.request has none, so
// a spec that names a peer gives app.fetch one.
const from = (peer: string) =>
  ({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

// The base as TRUSTED_PROXIES builds it, with a route that shows ctx.ip.
const behind = createBase(["10.0.0.0/8"])
  .plugin(health())
  .get("/ip", (ctx) => ctx.reply(200, { ip: ctx.ip ?? null }));

const get = (
  path: string,
  peer: string,
  headers: Record<string, string> = {},
) =>
  behind.fetch(
    new Request(`http://alxia.test${path}`, { headers }),
    from(peer),
  );

test("a trusted proxy's X-Forwarded-For sets ctx.ip", async () => {
  const response = await get("/ip", "10.0.0.7", {
    "x-forwarded-for": "203.0.113.9",
  });
  expect(await response.json()).toEqual({ ip: "203.0.113.9" });
});

test("a spoofed X-Forwarded-For from any other connection is refused", async () => {
  const response = await get("/ip", "198.51.100.4", {
    "x-forwarded-for": "203.0.113.9",
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("content-type")).toBe("application/problem+json");
});

test("a request with no forwarding header passes, so a health probe does", async () => {
  expect((await get("/health", "198.51.100.4")).status).toBe(200);
  expect((await get("/ready", "127.0.0.1")).status).toBe(200);
  expect(await (await get("/ip", "198.51.100.4")).json()).toEqual({
    ip: "198.51.100.4",
  });
});

test("unset, the base reads no forwarding header", async () => {
  const plain = createBase(undefined).get("/ip", (ctx) =>
    ctx.reply(200, { ip: ctx.ip ?? null }),
  );
  const response = await plain.fetch(
    new Request("http://alxia.test/ip", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    }),
    from("198.51.100.4"),
  );
  expect(await response.json()).toEqual({ ip: "198.51.100.4" });
});

import { expect, test } from "bun:test";

// src/env.ts checks Bun.env once, when it is first imported: a spec gives it
// a fresh copy (a query string makes a new module, so the import names its
// extension) under the value it tests.
const key = "TRUSTED_PROXIES";
const load = async (trustedProxies: string) => {
  const before = Bun.env[key];
  Bun.env[key] = trustedProxies;
  try {
    return await import(
      `./env.ts?trusted=${encodeURIComponent(trustedProxies)}`
    );
  } finally {
    if (before === undefined) delete Bun.env[key];
    else Bun.env[key] = before;
  }
};

test("a malformed TRUSTED_PROXIES stops the app, naming the variable", async () => {
  await expect(load("10.0.0.0/8, not-a-range")).rejects.toThrow(
    "TRUSTED_PROXIES.1: not a CIDR range or address",
  );
});

test("comma-separated ranges are trimmed, and an empty list declares no proxy", async () => {
  const { env } = await load("10.0.0.0/8, 172.16.0.0/12");
  expect(env.TRUSTED_PROXIES).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);
  expect((await load("")).env.TRUSTED_PROXIES).toBeUndefined();
});

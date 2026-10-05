import { expect } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";

export const ROOT = join(import.meta.dir, "..");

// Bun's own user agent is a bot to isbot, which gets the finished page,
// never a stream.
export const browser = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

/** React's text separators, out of the way of an assertion. */
export const text = (html: string) => html.replaceAll("<!-- -->", "");

export async function build(root: string) {
  const built = await $`${process.execPath} --bun react-router build`
    .cwd(root)
    // bun test sets NODE_ENV=test; a build for production wants its own.
    .env({ ...process.env, NODE_ENV: "production" })
    .quiet()
    .nothrow();
  if (built.exitCode !== 0) {
    throw new Error(
      `react-router build failed:\n${built.stdout}\n${built.stderr}`,
    );
  }
}

/** Runs build/server/index.js on a free port, as `bun run start` does. */
export async function start(root: string) {
  const child = Bun.spawn(
    [process.execPath, join(root, "build", "server", "index.js")],
    {
      cwd: root,
      env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const reader = child.stdout.getReader();
  let out = "";
  let url: string | undefined;
  while (url === undefined) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`the server exited: ${out}`);
    out += new TextDecoder().decode(value);
    url = out.match(/alxia listening on (\S+)/)?.[1];
  }
  reader.releaseLock();
  // Drained, so the server never blocks writing its logs to a full pipe.
  void (async () => {
    for await (const _ of child.stdout);
  })();
  void (async () => {
    for await (const _ of child.stderr);
  })();
  const get = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, url), {
      redirect: "manual",
      ...init,
      headers: { ...browser, ...init.headers },
    });
  const stop = async () => {
    child.kill("SIGTERM");
    await child.exited;
  };
  return { get, stop };
}

export type Server = Awaited<ReturnType<typeof start>>;

/** Every `<script …>` and module preload of a page: what a nonce must cover. */
export const scriptsOf = (html: string) =>
  html.match(/<script\b[^>]*>|<link rel="modulepreload"[^>]*>/g) ?? [];

/**
 * The home page and the streamed one, twice each: every script carries the
 * nonce the response's policy allows, and no two responses share one.
 */
export async function expectNonces(get: Server["get"]) {
  const seen = new Set<string>();
  for (const path of ["/", "/", "/slow", "/slow"]) {
    const response = await get(path);
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1] as string;
    expect(nonce).toMatch(/^[\w+/]{22}==$/);
    const scripts = scriptsOf(await response.text());
    expect(scripts.length).toBeGreaterThan(2);
    for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);
    seen.add(nonce);
  }
  expect(seen.size).toBe(4);
}

/** The first entry client bundle a page links to. */
export const assetOf = (html: string) =>
  html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0] as string;

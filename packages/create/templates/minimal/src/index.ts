import { alxia } from "@alxia/core";

export const app = alxia().get("/", ({ reply }) =>
  reply(200, { hello: "world" }),
);

// Only when this file is the entry: the test imports `app` and listens on
// no port.
if (import.meta.main) {
  // In dev, the URL and the route table; in production, the URL alone.
  app.listen({
    port: Number(Bun.env["PORT"] ?? 3000),
    onListen: ({ dev, table, url }) =>
      console.log(dev ? table : `listening on ${url}`),
  });
  // In a container Bun is process 1, which a signal with no handler does not
  // stop: `docker stop` would wait.
  process.once("SIGTERM", () => void app.stop().then(() => process.exit(0)));
}

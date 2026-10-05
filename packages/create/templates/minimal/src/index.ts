import { alxia } from "@alxia/core";

export const app = alxia().get("/", ({ reply }) =>
  reply(200, { hello: "world" }),
);

// Only when this file is the entry: the test imports `app` and listens on
// no port.
if (import.meta.main) {
  const server = app.listen(Number(Bun.env["PORT"] ?? 3000));
  console.log(`listening on ${server.url}`);
  // In a container Bun is process 1, which a signal with no handler does not
  // stop: `docker stop` would wait.
  process.once("SIGTERM", () => void app.stop().then(() => process.exit(0)));
}

import { app } from "./app";
import { env } from "./env";

// Stop as the platform asks. In a container Bun is process 1, which a
// signal with no handler does not stop: `docker stop` would wait.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
  });
}

// In dev, the URL and the route table; in production, the URL alone.
app.listen({
  port: env.PORT,
  onListen: ({ dev, table, url }) =>
    console.log(dev ? table : `listening on ${url}`),
});

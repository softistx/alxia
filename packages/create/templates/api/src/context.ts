import { alxia, trustProxy } from "@alxia/core";
import { env } from "./env";
import type { Todo } from "./generated/types";

const todos: Todo[] = [];

// The base: what every route reads, decorated or derived here. It is
// registered below, so a route file reads it with no import of the app.
// alxia's own errors — a 400 the schemas refuse, a 404 no route matches, a
// 500 — are RFC 9457 problems, as openapi.yaml declares them.
//
// Behind a load balancer, set TRUSTED_PROXIES to its range: its
// X-Forwarded-For then sets ctx.ip, and a forwarding header from any other
// connection is refused with a 403. A request that carries none, a health
// probe's, passes from anywhere. Unset, no forwarding header is read.
export function createBase(
  trusted: string[] | undefined = env.TRUSTED_PROXIES,
) {
  return alxia({
    errors: "problem",
    ...(trusted && { proxy: trustProxy({ trusted, untrusted: "refuse" }) }),
  }).decorate({ todos });
}

export const base = createBase();

// Register the base, never the app: the app mounts the route files, whose
// type reads this, and would then be typed by itself.
declare module "@alxia/core" {
  interface Register {
    context: typeof base;
  }
}

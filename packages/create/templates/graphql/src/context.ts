import { alxia, defineMiddleware, trustProxy } from "@alxia/core";
import type { GraphQLContext } from "@alxia/graphql";
import { env } from "./env";
import type { Loaders } from "./loaders";
import { db } from "./store";

// Reads the bearer token: `viewer` is the user it names, or null. A query
// may be anonymous, so this refuses nothing; a resolver that needs a user
// refuses (`addNote`). `viewer` is typed in every resolver.
const viewerOf = defineMiddleware(({ request }, next) => {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  const id = token === undefined ? undefined : db.tokens.get(token);
  return next({
    viewer: (id === undefined ? undefined : db.users.get(id)) ?? null,
  });
});

// The base: what every resolver reads, decorated or derived here.
//
// Behind a load balancer, set TRUSTED_PROXIES to its range: its
// X-Forwarded-For then sets ctx.ip, and a forwarding header from any other
// connection is refused with a 403. A request that carries none, a health
// probe's, passes from anywhere. Unset, no forwarding header is read.
export function createBase(
  trusted: string[] | undefined = env.TRUSTED_PROXIES,
) {
  return alxia({
    ...(trusted && { proxy: trustProxy({ trusted, untrusted: "refuse" }) }),
  })
    .decorate({ env, db })
    .use(viewerOf);
}

export const base = createBase();

// A resolver's context: Yoga's, the base's (`env`, `db`, `viewer`) and the
// per-request `loaders` that src/app.ts's `context` option builds. The
// generated `Resolvers` takes it (codegen.ts: `contextType`).
export type Context = GraphQLContext<typeof base, { loaders: Loaders }>;

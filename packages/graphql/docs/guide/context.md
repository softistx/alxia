# The typed context

This page covers what a resolver reads as its context — Yoga's, the app's,
and what the `context` option adds — how to type a schema with it, and the
compile error when the schema reads what the app does not build.

```ts
import { alxia } from '@alxia/core';
import { graphql, type GraphQLContext } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

const users = new Map([['1', { id: '1', name: 'Ada' }]]);

const base = alxia()
	.decorate({ users })
	.derive(({ request }) => ({ viewer: request.headers.get('x-user') }));

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `
		type User { id: ID!, name: String! }
		type Query { me: String, user(id: ID!): User }
	`,
	resolvers: {
		Query: {
			me: (_, __, { viewer }) => viewer,                         // string | null
			user: (_, { id }: { id: string }, { users }) => users.get(id) ?? null,
		},
	},
});

const app = base.plugin((app) => graphql(app, { schema }));
```

Declare the hooks on a `base` app, type the schema with
`GraphQLContext<typeof base>`, then mount the endpoint on it. The schema
cannot be typed from `app` itself: `app` is built from the schema.

## `GraphQLContext`

```ts
type GraphQLContext<App, UserContext = Empty> =
	YogaInitialContext & ServerContext<ContextOf<App>> & UserContext;
	// when App is not an alxia app — a function returning one, a schema, a route:
	// { readonly '~error': 'GraphQLContext needs the type of an app: GraphQLContext<typeof app>' }

type ServerContext<Ctx> = Omit<
	BaseContext & Ctx,
	'params' | 'query' | 'headers' | 'cookies' | 'body' | 'reply' | 'redirect'
>;
```

Given anything but an app's type, the context holds only that message, so
the first resolver that reads a field is a compile error naming it:

```text
error TS2339: Property 'viewer' does not exist on type '{ readonly '~error': "GraphQLContext needs the type of an app: GraphQLContext<typeof app>"; } & YogaInitialContext'.
```

Give it the app's type, `typeof base` — not that of a function that builds
the app, nor of a schema
([Troubleshooting](../troubleshooting.md#property-viewer-does-not-exist-on-type--readonly-error-graphqlcontext-needs-the-type-of-an-app-graphqlcontexttypeof-app---yogainitialcontext)).

A resolver's context holds:

| From | Fields |
| --- | --- |
| Yoga (`YogaInitialContext`) | `request`, and `params`: the GraphQL request's `query`, `variables`, `operationName`, `extensions` |
| the app's hooks | everything `decorate` and `derive` added before the endpoint, and what plugins such as `@alxia/jwt`'s `bearer` add (`user`) |
| the route (`BaseContext`) | `url`, `ip`, `server`, `route`, `pathParams`, `error`, and `set` |
| the `context` option | what it returns, as `UserContext` ([below](#the-context-option)) |

What a route handler reads but a resolver does not: `query`, `headers`,
`cookies` and `body` are the GraphQL request's, read through `request` and
`params`; `reply` and `redirect` answer a route, not a field. `params` is
Yoga's, not the route's path parameters. A resolver that reads one is a
compile error:

```text
error TS2339: Property 'query' does not exist on type 'YogaInitialContext & ServerContext<…> & Empty'.
```

Read a header or a cookie from `request`:

```ts
const locale = (_: unknown, __: unknown, { request }: GraphQLContext<typeof base>) =>
	request.headers.get('accept-language') ?? 'en';
```

## Setting a header or a cookie

`set` is the route's: what a resolver sets on it is on the response, beside
Yoga's own headers.

```ts
const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `type Query { ok: Boolean } type Mutation { login(name: String!): Boolean! }`,
	resolvers: {
		Mutation: {
			login: (_, { name }: { name: string }, { set }) => {
				set.cookies.set('session', name, { httpOnly: true, sameSite: 'lax' });
				set.headers.set('cache-control', 'no-store');
				return true;
			},
		},
	},
});
```

`set.cookies` is a `Bun.CookieMap`: each `set` or `delete` is a
`Set-Cookie` header. `set.headers` is a `Headers`.

## The compile check

Yoga's types alone accept any schema. `graphql` also checks that the
context the app builds holds what the schema's resolvers read. A schema
typed with a context the app does not build is refused, and the error names
the missing field:

```ts
const app = alxia().plugin((app) => graphql(app, { schema })); // no hook derives `viewer` or `users`
```

```text
error TS2322: Type 'GraphQLSchemaWithContext<…>' is not assignable to type 'GraphQLSchema & { _context?: … } & ("the schema's resolvers read a context the app does not build: missing users" | "the schema's resolvers read a context the app does not build: missing viewer")'.
  …
    Type 'GraphQLSchemaWithContext<…>' is not assignable to type '"the schema's resolvers read a context the app does not build: missing viewer"'.
```

With `exactOptionalPropertyTypes` on, the code is `TS2375`; the message
ends the same way. The fix is to mount the endpoint on the
app the schema was typed from, after its hooks:
[Troubleshooting](../troubleshooting.md#the-schemas-resolvers-read-a-context-the-app-does-not-build-missing-).

An untyped schema — `createSchema({ … })` with no type argument — passes
on any app, but its resolvers see Yoga's context only: reading `viewer`
there is `Property 'viewer' does not exist`. Type the schema to read the
app's context.

## With a token: `@alxia/jwt`

A guard plugin is a hook like any other. With `@alxia/jwt`'s `bearer`, the
endpoint requires a token and `user` is the token's claims, typed by the
schema you give it:

```ts
import { alxia } from '@alxia/core';
import { graphql, type GraphQLContext } from '@alxia/graphql';
import { bearer, createJwt } from '@alxia/jwt';
import { createSchema } from 'graphql-yoga';
import { z } from 'zod';

const jwt = createJwt({ secret: Bun.env['JWT_SECRET']! });
const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']) });

const base = alxia().plugin(bearer({ jwt, schema: Claims })); // 401 without a valid token

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `type Query { me: String!, isAdmin: Boolean! }`,
	resolvers: {
		Query: {
			me: (_, __, { user }) => user.sub,                  // user: { sub: string; role: 'admin' | 'user' }
			isAdmin: (_, __, { user }) => user.role === 'admin',
		},
	},
});

const app = base.plugin((app) => graphql(app, { schema }));
```

The guard's `401` and its body are `@alxia/jwt`'s, described in its
[bearer guard guide](https://github.com/softistx/alxia/blob/develop/packages/jwt/docs/guide/bearer-guard.md).

## The `context` option

Yoga's `context` option adds to the context per request. Its argument is
the context so far — Yoga's and the app's — and what it returns is merged
in. Give its type to `GraphQLContext` as the second argument:

```ts
type Loaders = { loaders: { user: (id: string) => Promise<User | null> } };

const schema = createSchema<GraphQLContext<typeof base, Loaders>>({
	typeDefs: /* GraphQL */ `type User { id: ID!, name: String! } type Query { user(id: ID!): User }`,
	resolvers: {
		Query: { user: (_, { id }: { id: string }, { loaders }) => loaders.user(id) },
	},
});

const app = base.plugin((app) =>
	graphql(app, {
		schema,
		// annotate the argument: see below
		context: ({ users }: GraphQLContext<typeof base>) => ({
			loaders: { user: async (id: string) => users.get(id) ?? null },
		}),
	}),
);
```

Without the `context` option, the same schema is refused: the error ends in
`missing loaders`.

**Annotate the argument when the function reads it.** TypeScript infers
`UserContext` from what the function returns only when the function does
not depend on its parameter's contextual type. `({ users }) => …`
unannotated leaves `UserContext` as `Empty`, and the schema is refused
with `missing loaders` although the function returns them. A function that
takes no argument, or annotates it, is inferred:

```ts
context: () => ({ loaders: createLoaders() }),                                  // inferred
context: ({ users }: GraphQLContext<typeof base>) => ({ loaders: …(users) }),   // inferred
context: ({ users }) => ({ loaders: …(users) }),                                // `missing loaders`
```

Prefer a `derive` on the app for what every route needs — the user, a
database handle — and the `context` option for what only resolvers do, such
as per-request data loaders.

## See also

- [Mounting the endpoint](endpoint.md): which hooks run before it.
- [Hooks](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/hooks.md),
  in `@alxia/core`'s guide: `decorate` and `derive`.

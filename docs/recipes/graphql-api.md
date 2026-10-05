# A GraphQL API

**The problem.** You want a GraphQL API that is a citizen of the app, not a
sidecar: the schema is the contract, the resolvers are typed from it, the
signed-in user is in every resolver's context, subscriptions stream, the IDE
is there in development and gone in production, and the process drains
cleanly when it is stopped, with the same tests, middlewares, probes and
Dockerfile as any alxia app.

In alxia the GraphQL endpoint is a route. [`@alxia/graphql`](../../packages/graphql)
mounts [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) at
`/graphql`, **behind the app's middlewares**, and a resolver reads what they
added, typed. Yoga's plugins, options and ecosystem are yours whole.

`bun create @alxia my-graph --template graphql` writes the project below,
with a development token in place of a JWT. This recipe goes on to the
production parts: a real token, authorisation, the drain and the probes.

```sh
bun add @alxia/core @alxia/graphql @alxia/jwt @alxia/logger graphql graphql-yoga
bun add -d @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers typescript
```

## 1. The schema is the contract

```graphql
# file: schema.graphql
type Query {
  "The signed-in user, or null with no valid token."
  me: User
  notes: [Note!]!
}

type Mutation {
  "Needs a token."
  addNote(text: String!): Note!
  "The author's, or an admin's."
  deleteNote(id: ID!): Boolean!
}

type Subscription {
  "Each note added, as it is added, over server-sent events."
  noteAdded: Note!
}

type User {
  id: ID!
  name: String!
}

type Note {
  id: ID!
  text: String!
  author: User!
}
```

`bun run generate` writes `src/generated/resolvers.ts` from it: the schema's
types and `Resolvers`, whose context is the app's own. A field the schema
lacks, or a return its type refuses, is a compile error. `mappers` says that
a `Note` resolver returns the record the store holds, whose `author` the
`Note.author` resolver then loads.

```ts
// file: codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
	schema: 'schema.graphql',
	generates: {
		'src/generated/resolvers.ts': {
			plugins: ['typescript', 'typescript-resolvers'],
			config: {
				contextType: '../context#Context',
				mappers: { Note: '../store#NoteRecord' },
				useTypeImports: true,
				useIndexSignature: true,
			},
		},
	},
};

export default config;
```

```ts
// file: src/graphql.d.ts
// `import typeDefs from '../schema.graphql' with { type: 'text' }`: Bun reads
// the file as text, and `bun run build` puts it in dist/server.js.
declare module '*.graphql' {
	const source: string;
	export default source;
}
```

## 2. The viewer: a middleware every resolver reads

Authentication is a middleware, as everywhere in alxia. This one **refuses
nothing**: a query may be anonymous, so `viewer` is the user or `null`, and a
resolver that needs a user says so. To refuse every anonymous request instead,
give the endpoint `@alxia/jwt`'s `bearer()`: a 401 before GraphQL runs
(see [the layers of an auth error](#auth-errors-in-three-layers)).

```ts
// file: src/store.ts
import { createPubSub } from 'graphql-yoga';

export interface UserRecord {
	id: string;
	name: string;
	role: 'admin' | 'user';
}

export interface NoteRecord {
	id: string;
	text: string;
	authorId: string;
}

// An in-memory store, for the example: swap it for your database.
export const db = {
	users: new Map<string, UserRecord>([
		['1', { id: '1', name: 'Ada', role: 'admin' }],
		['2', { id: '2', name: 'Grace', role: 'user' }],
	]),
	notes: [] as NoteRecord[],
};

// What a subscription streams: a mutation publishes, `noteAdded` subscribes.
// One process only: across several, back it with a broker.
export const pubsub = createPubSub<{ noteAdded: [NoteRecord] }>();

// How many times the store was asked for users: a stand-in for a database's
// query log. `findUsers` is one query however many ids it is given.
export const queries = { users: 0 };

// The batch behind `loaders.user` ([section 4](#4-batching-with-dataloader-n1)):
// one `WHERE id IN (...)` in a database. It answers each id in order, an
// Error for one that is missing.
export async function findUsers(ids: readonly string[]): Promise<(UserRecord | Error)[]> {
	queries.users += 1;
	return ids.map((id) => db.users.get(id) ?? new Error(`No user ${id}`));
}
```

```ts
// file: src/jwt.ts
import { createJwt } from '@alxia/jwt';

export const jwt = createJwt({
	secret: Bun.env['JWT_SECRET'] ?? 'a-development-secret-of-32-bytes-or-more',
	expiresIn: 3600,
});
```

```ts
// file: src/context.ts
import { alxia, defineMiddleware, forwardedIp, health } from '@alxia/core';
import type { GraphQLContext } from '@alxia/graphql';
import { jwt } from './jwt';
import type { Loaders } from './loaders';
import { db } from './store';

// The user the bearer token names, or null: a bad token is anonymous here,
// and the resolvers decide. `viewer` is typed in every resolver.
const viewerOf = defineMiddleware(async ({ request }, next) => {
	const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
	const verified = token === undefined ? undefined : await jwt.verify(token);
	const viewer = verified?.ok && verified.claims.sub ? db.users.get(verified.claims.sub) : undefined;
	return next({ viewer: viewer ?? null });
});

// How many proxies sit in front of the app (`PROXY_HOPS=1` behind one load
// balancer, 0 for none). With some, the client's address is the one they
// append to `X-Forwarded-For` ([section 7](#7-harden-it-for-production)).
const hops = Number(Bun.env['PROXY_HOPS'] ?? 0);
if (!Number.isInteger(hops) || hops < 0) throw new Error('PROXY_HOPS is a number of proxies: 0 or more');

// The base: what every resolver reads. The probes come first, so they run
// no middleware and need no token; then `db` and `viewer` for the rest. Each
// app builds on `base.fork()`, its own copy: the app, a second entry point
// and a spec ([section 7](#7-harden-it-for-production)) share the base, and
// none declares on it.
export const base = alxia({ errors: 'problem', ...(hops > 0 && { ip: forwardedIp({ trusted: hops }) }) })
	.plugin(health())
	.decorate({ db })
	.use(viewerOf);

// A resolver's context: Yoga's, the base's (`db`, `viewer`) and the
// per-request `loaders` that `src/app.ts`'s `context` option builds
// ([section 4](#4-batching-with-dataloader-n1)). The generated `Resolvers`
// takes it (codegen.ts: `contextType`).
export type Context = GraphQLContext<typeof base, { loaders: Loaders }>;
```

## 3. Typed resolvers

```ts
// file: src/resolvers.ts
import { GraphQLError } from 'graphql';
import type { Context } from './context';
import type { Resolvers } from './generated/resolvers';
import { type NoteRecord, pubsub } from './store';

// A GraphQLError reaches the client as it is, with its code; any other
// Error is masked as "Unexpected error.", its message kept on the server.
function signedIn({ viewer }: Context) {
	if (viewer === null) {
		throw new GraphQLError('Sign in to do this', { extensions: { code: 'UNAUTHENTICATED' } });
	}
	return viewer;
}

export const resolvers: Resolvers = {
	Query: {
		me: (_, __, { viewer }) => viewer,
		notes: (_, __, { db }) => db.notes,
	},
	Mutation: {
		addNote: (_, { text }, context) => {
			const viewer = signedIn(context);
			const note = { id: String(context.db.notes.length + 1), text, authorId: viewer.id };
			context.db.notes.push(note);
			pubsub.publish('noteAdded', note);
			return note;
		},
		deleteNote: (_, { id }, context) => {
			const viewer = signedIn(context);
			const index = context.db.notes.findIndex((note) => note.id === id);
			const note = context.db.notes[index];
			if (note === undefined) return false;
			if (note.authorId !== viewer.id && viewer.role !== 'admin') {
				throw new GraphQLError('Only the author or an admin deletes a note', {
					extensions: { code: 'FORBIDDEN' },
				});
			}
			context.db.notes.splice(index, 1);
			return true;
		},
	},
	Subscription: {
		noteAdded: {
			subscribe: () => pubsub.subscribe('noteAdded'),
			resolve: (note: NoteRecord) => note,
		},
	},
	Note: {
		// The notes of one query load their authors in one batch: see section 4.
		author: (note, _, { loaders }) => loaders.user.load(note.authorId),
	},
};
```

`createSchema<Context>` takes the schema text and the resolvers. A schema
whose resolvers read a context the app does not build does not compile, so
renaming `viewer` in the middleware finds every resolver that read it.

```ts
// file: src/schema.ts
import { createSchema } from 'graphql-yoga';
import typeDefs from '../schema.graphql' with { type: 'text' };
import type { Context } from './context';
import { resolvers } from './resolvers';

export const schema = createSchema<Context>({ typeDefs, resolvers });
```

## 4. Batching with DataLoader (N+1)

`Note.author` runs once per note. Resolved with `db.users.get` that is cheap,
but with a database it is one query per note: a list of 50 notes makes 51
queries, the N+1 problem. [DataLoader](https://github.com/graphql/dataloader)
collects the `load(id)` calls made in the same tick of a request and calls
your function once with all the ids.

```sh
bun add dataloader
```

```ts
// file: src/loaders.ts
import DataLoader from 'dataloader';
import { findUsers } from './store';

// The loaders of ONE request: `context` in src/app.ts calls this per request.
export function createLoaders() {
	return { user: new DataLoader(findUsers) };
}

export type Loaders = ReturnType<typeof createLoaders>;
```

**Build the loaders per request, in the `context` option.** The option runs
for each request and what it returns is merged into the context, typed
through `GraphQLContext`'s second argument (`Context` in section 2), so
`loaders.user.load` is typed in every resolver. Do not make the loaders
module-level or `decorate` them on the app:

- A DataLoader **caches** every key it has loaded. One shared by all requests
  keeps a user's data for the life of the process: it serves a stale record
  after an update, grows without bound, and, for a loader that reads with the
  viewer's permissions, hands one user's data to the next. A loader per
  request caches only within that request, where one viewer sees one
  consistent snapshot.
- Its batching window is a tick of the event loop; the loaders of one
  request need no coordination with another's.

## 5. Mount it, with the IDE and the drain

```ts
// file: src/app.ts
import { graphql } from '@alxia/graphql';
import { logger } from '@alxia/logger';
import { base } from './context';
import { createLoaders } from './loaders';
import { schema } from './schema';

// GET and POST /graphql, behind the base's middlewares. Subscriptions are
// served over server-sent events. GraphiQL answers a browser's GET in the
// app's dev alone (NODE_ENV=development, the dev script's); deployed, none.
// `logger()` goes first: one line per request, naming the operation.
export const app = base.fork().use(logger()).plugin((app) =>
	graphql(app, {
		schema,
		// The loaders, anew for each request: never share their cache.
		context: () => ({ loaders: createLoaders() }),
		logging: false, // Yoga's logger, quiet here
	}),
);
```

```ts
// file: src/server.ts
import { app } from './app';

// listen handles SIGINT and SIGTERM. On either: /ready answers 503, the
// queries and mutations in flight are answered, the subscriptions end (their
// clients reconnect to another instance), then the process exits.
app.listen({ port: Number(Bun.env['PORT'] ?? 3000), shutdownTimeout: 10_000 });
```

- **GraphiQL** answers a `GET` from a browser at `/graphql` in dev
  (`NODE_ENV=development`), and nowhere else unless `ide: 'graphiql'` says
  so. Use `ide: 'apollo-sandbox'` for Apollo's explorer. Either gets a
  `Content-Security-Policy` that lets it load, which `@alxia/secure-headers`
  keeps ([the IDE guide](../../packages/graphql/docs/guide/ide.md)).
- **The drain.** A subscription is a long response, and would hold the
  shutdown until `shutdownTimeout`: alxia ends it as soon as the shutdown
  starts. `GET /health` stays 200, so the platform does not restart the
  process; `GET /ready` turns 503 so it stops sending traffic
  ([Health and graceful shutdown](health-and-shutdown.md)).

### See which operation ran

Every GraphQL call is a `POST /graphql`, so a log of the route alone cannot
tell `GetNotes` from `AddNote`. `graphql()` tells the observers around it
the operation it executes, and they read it with no import of one another:
`logger()`, above, adds `operationName` and `operationType` to the request's
line, and `telemetry()` names its span `query GetNotes`, with
OpenTelemetry's `graphql.operation.name` and `graphql.operation.type`.

```json
{"level":"info","message":"POST /graphql 200","operationName":"AddNote","operationType":"mutation","status":200}
```

```ts no-check
// Tracing is one more middleware, given first, beside the logger.
const tracing = telemetry({ service: 'notes', exporters: [otlpExporter({ endpoint })] });
const app = base.fork().use(tracing).use(logger()).plugin((app) => graphql(app, { schema }));
```

- A batched body (`batching: true`, an array) is one line and one span: the
  type is `batch` and the name lists every operation's, `GetNotes,AddNote`.
- A request refused before it executes (a syntax error, a document that
  fails validation) names no operation. An anonymous one has a type alone.
- Over `ws: true`, the upgrade is one line and one span, and each
  operation on the socket another, from its `subscribe` message to its
  end: a line carrying the upgrade's `requestId`, its `duration` and
  `outcome` (`ok`, or `errors`, a `warn`), and a span that is a child of
  the upgrade's, `subscription OnNote`, an error when answered with errors.

### Auth errors in three layers

| Where it fails | The answer | Who answers |
| --- | --- | --- |
| a guard before the endpoint, such as `.use(bearer({ jwt }))` | `401`, `application/problem+json` under `errors: 'problem'` | the middleware, before GraphQL runs |
| a resolver, no viewer | `200 { "errors": [{ "extensions": { "code": "UNAUTHENTICATED" } }] }` | Yoga, GraphQL's own format |
| a resolver, not allowed | `200 { "errors": [{ "extensions": { "code": "FORBIDDEN" } }] }` | Yoga |

GraphQL's errors stay GraphQL's: they travel in `errors[]`, inside a 200, as
the GraphQL over HTTP specification has it, and clients such as Apollo read
the `code`. `errors: 'problem'` changes the HTTP layer around the endpoint
alone: a 413, a 500 from a middleware, a 405. To put a resolver's error on
an HTTP status too, give the extension `http: { status: 401 }`.

### WebSocket clients

Apollo Client's `GraphQLWsLink` and urql's `subscriptionExchange` subscribe
over WebSocket, with `graphql-ws`. Add the optional peer and `ws: true`;
server-sent events stay served at the same path:

```sh
bun add graphql-ws
```

```ts no-check
graphql(app, { schema, ws: true }); // ws://localhost:3000/graphql too
```

The upgrade runs the base's middlewares, so `viewer` is read on it. A
browser cannot set `authorization` on a socket: have `viewerOf` read the
token from the URL too —

```ts no-check
const token =
	request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] ??
	new URL(request.url).searchParams.get('token') ?? undefined;
```

— or from a cookie. The client's `connectionParams` arrive after the
upgrade, in the first message, so the base's middlewares never see them;
they are in each resolver's context. A shutdown closes the sockets with
`1001`. The client side, Apollo's and urql's, is in
[GraphQL over WebSocket](../../packages/graphql/docs/guide/websockets.md#clients).

## 6. Test it, in process

```ts
// file: src/app.spec.ts
import { describe, expect, spyOn, test } from 'bun:test';
import { app } from './app';
import { jwt } from './jwt';
import { db, pubsub } from './store';

interface Result {
	data?: Record<string, unknown> | null;
	errors?: { message: string; extensions?: { code?: string } }[];
}

// POST /graphql in process, as a client would: no port.
async function query(source: string, options: { as?: string; variables?: Record<string, unknown> } = {}): Promise<Result> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (options.as) headers['authorization'] = `Bearer ${await jwt.sign({ sub: options.as })}`;
	const response = await app.request('/graphql', {
		method: 'POST',
		headers,
		body: JSON.stringify({ query: source, variables: options.variables }),
	});
	return response.json();
}

const ADD = 'mutation ($text: String!) { addNote(text: $text) { id text author { name } } }';

describe('queries and mutations', () => {
	test('me is null with no token, and the user a token names', async () => {
		expect((await query('{ me { name } }')).data).toEqual({ me: null });
		expect((await query('{ me { name } }', { as: '1' })).data).toEqual({ me: { name: 'Ada' } });
	});

	test('no viewer is UNAUTHENTICATED, a stranger FORBIDDEN, the author allowed', async () => {
		const anonymous = await query(ADD, { variables: { text: 'Hello' } });
		expect(anonymous.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

		const added = await query(ADD, { as: '2', variables: { text: 'Hello' } });
		expect(added.errors).toBeUndefined();
		const id = (added.data?.['addNote'] as { id: string }).id;
		expect(added.data).toMatchObject({ addNote: { text: 'Hello', author: { name: 'Grace' } } });

		const del = 'mutation ($id: ID!) { deleteNote(id: $id) }';
		db.users.set('3', { id: '3', name: 'Alan', role: 'user' });
		const refused = await query(del, { as: '3', variables: { id } });
		expect(refused.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
		expect((await query(del, { as: '2', variables: { id } })).data).toEqual({ deleteNote: true });
	});
});

describe('the log', () => {
	test('a request line names the operation', async () => {
		const log = spyOn(console, 'log').mockImplementation(() => {});
		try {
			await query('query GetMe { me { name } }');
			const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(lines).toMatchObject([
				{ message: 'POST /graphql 200', operationName: 'GetMe', operationType: 'query' },
			]);
		} finally {
			log.mockRestore();
		}
	});
});

describe('subscriptions', () => {
	test('noteAdded streams each note over server-sent events', async () => {
		const response = await app.request('/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify({ query: 'subscription { noteAdded { text } }' }),
		});
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		const reader = response.body?.getReader();
		if (reader === undefined) throw new Error('no body');
		// Publish until the stream carries it: the subscription starts as it is read.
		const publish = setInterval(() => pubsub.publish('noteAdded', { id: '9', text: 'Streamed', authorId: '1' }), 20);
		try {
			let seen = '';
			while (!seen.includes('Streamed')) {
				const { done, value } = await reader.read();
				if (done) throw new Error(`the stream ended: ${seen}`);
				seen += new TextDecoder().decode(value);
			}
			expect(seen).toContain('"noteAdded":{"text":"Streamed"}');
		} finally {
			clearInterval(publish);
			await reader.cancel();
		}
	});
});

describe('the IDE, the probes and the drain', () => {
	test('GraphiQL answers a browser in development alone; the probes need no token', async () => {
		// `bun test` sets NODE_ENV=test: the app is not in dev, and serves no page.
		const page = await app.request('/graphql', { headers: { accept: 'text/html' } });
		expect(page.headers.get('content-type') ?? '').not.toContain('text/html');
		expect((await app.request('/health')).status).toBe(200);
		expect((await app.request('/ready')).status).toBe(200);
	});

	test('on stop, readiness turns 503 and a subscription ends', async () => {
		const server = app.listen({ port: 0, signals: false });
		const url = `${server.url.href}graphql`;
		const subscription = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify({ query: 'subscription { noteAdded { text } }' }),
		});
		const events = subscription.text(); // resolves when the stream ends
		await Bun.sleep(100);
		const stopping = app.stop();
		expect((await app.request('/ready')).status).toBe(503);
		await events; // ended by the shutdown, not by the timeout
		await stopping;
	});
});
```

## 7. Harden it for production

The endpoint above works. What a GraphQL API exposed to the internet also
needs is not in a schema: one request can ask for a great deal, nothing says
who may ask how often, and the defaults that help a developer help an
attacker. Seven points, each a few lines. Add the packages the snippets use:

```sh
bun add @alxia/rate-limit @envelop/depth-limit @graphql-yoga/plugin-csrf-prevention @graphql-yoga/plugin-persisted-operations
```

### Rate limit the endpoint

`@alxia/rate-limit` goes to `use` before the endpoint, and counts the
requests to it. Key it by the viewer, so one user's allowance is theirs
wherever they connect from, and by the client's address for an anonymous
request. Behind a proxy, the address is the proxy's unless the app reads the
header it appends to: that is `PROXY_HOPS` in [section 2](#2-the-viewer-a-middleware-every-resolver-reads)'s
base (`forwardedIp`, which never believes the entries the client wrote).

```ts
// file: src/limits.ts
import { rateLimit } from '@alxia/rate-limit';
import type { UserRecord } from './store';

// What is counted: the viewer's id, else the client's address. `undefined`
// is not counted: with no address (a request made in process, with no
// socket) there is nothing to count.
export const keyOf = ({ viewer, ip }: { viewer: UserRecord | null; ip: string | undefined }) =>
	viewer ? `user:${viewer.id}` : ip && `ip:${ip}`;

// `max` requests a minute for each key. Past it, a 429 with `Retry-After`.
export const limitTo = (max: number) =>
	rateLimit<{ viewer: UserRecord | null }>({ limit: max, windowMs: 60_000, key: keyOf });
```

**One HTTP request is not one operation.** A client may send an array of
operations in a single `POST` when `batching` is on, and a document may ask
for a hundred fields, or the same expensive field a hundred times under
aliases. The limit counts the request: keep `batching` off, or give it a
small `limit`, and bound the cost of one operation with the next point.

### Limit depth and complexity

`useDepthLimit` from `@envelop/depth-limit` refuses a document nested deeper
than `maxDepth` before it executes
([Yoga's plugins](../../packages/graphql/docs/guide/yoga.md#plugins) shows
it beside the others). Depth is one dimension: aliases, list sizes and
fragments multiply the work at a depth that is allowed, so give every list
argument a maximum in the schema, and add a cost plugin when a client
may write its own documents.

```ts
// file: src/depth.ts
import { useDepthLimit } from '@envelop/depth-limit';

// A document nested deeper than `maxDepth` is refused at validation, before
// a resolver runs: a 200 with `errors`, GraphQL's own format.
export const depthLimit = (maxDepth: number) => useDepthLimit({ maxDepth });
```

### Introspection off in production

Introspection hands anyone the whole schema, the fields you meant to keep
quiet included. GraphiQL needs it, so it follows the same switch: on in
development, off everywhere else. `isDev(context)` is the `ide`'s own test
(`alxia({ dev })`, else `NODE_ENV=development`), and the plugin adds
graphql-js's rule that refuses `__schema` and `__type` otherwise.

```ts
// file: src/introspection.ts
import { isDev } from '@alxia/core';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import type { Plugin } from 'graphql-yoga';

export const introspectionOnlyInDev: Plugin = {
	onValidate({ addValidationRule, context }) {
		if (!isDev(context)) addValidationRule(NoSchemaIntrospectionCustomRule);
	},
};
```

This hides the schema from a client that asks, not from one that guesses
field names: it is not authorisation. Yoga's error suggestions ("Did you
mean…") also leak names; the plugin `@escape.tech/graphql-armor-block-field-suggestions`
removes them.

### Masked errors

Yoga masks errors by default (`maskedErrors: true`): an `Error` a resolver
throws reaches the client as `Unexpected error.`, with its message and stack
kept on the server. Leave it on. To tell the client something, throw a
`GraphQLError`, whose message is shown, with an `extensions.code` the client
can switch on; `extensions.http.status` puts the same refusal on the HTTP
status too (the [layers of an auth error](#auth-errors-in-three-layers)).

```ts
// file: src/errors.ts
import { GraphQLError } from 'graphql';

// What a client may read: a stable `code`, and a message meant for people.
export function invalid(message: string, field: string): GraphQLError {
	return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', field } });
}

export function notFound(what: string): GraphQLError {
	return new GraphQLError(`No ${what}`, { extensions: { code: 'NOT_FOUND', http: { status: 404 } } });
}
```

### Cap the body

Yoga reads the whole body of a `POST` before it parses it, so a megabyte of
JSON costs a megabyte of memory. Core's `bodyLimit(bytes)` caps every route
declared after it: the bytes are counted as they arrive, and reading stops
at the limit. A query is a few kilobytes: 100 KiB is generous. A mutation
that takes a file by `multipart` needs a larger limit on a route of its own.

Put the call before `graphql(...)`, as in [Together](#together). Yoga reads
the body itself and would report a body it could not read as `400`, `POST
body sent invalid JSON.`; `@alxia/graphql` throws core's `ContentTooLargeError`
again instead, so a client gets the 413 a plain route answers, in the app's
error format (`application/problem+json` under `errors: 'problem'`), with a
`Content-Length` or without one (a chunked body). Whatever else Yoga cannot
parse is still its 400, and its parser's own error is never sent
(`extensions.originalError` is removed).

### CSRF for a cookie-authenticated API

A bearer token in a header cannot be sent by another site's form. A
**cookie** can: a page on another origin may make the browser `POST` the
cookie to `/graphql`. `SameSite=Lax` on the cookie is the first line (a
cross-site `POST` does not carry it); two more close the rest.

- Yoga's CSRF prevention plugin refuses a request without a custom header
  (`x-graphql-yoga-csrf` by default): a browser cannot add one to a request
  across origins without a CORS preflight, which `@alxia/cors` answers only
  for the origins you named.
- Require `application/json` on a `POST`, which an HTML form cannot send. Yoga
  also accepts a form-encoded `POST` and a `GET` query, the two a form or a
  link can make, so this is a middleware before the endpoint.

```ts
// file: src/csrf.ts
import { defineMiddleware, HttpError } from '@alxia/core';
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention';

export const csrf = useCSRFPrevention({ requestHeaders: ['x-csrf'] });

// A POST that is not JSON is refused with a 415 before Yoga reads it.
export const jsonOnly = defineMiddleware(async ({ request }, next) => {
	if (request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) {
		throw new HttpError(415, { error: 'unsupported_media_type' });
	}
	return next();
});
```

### Persisted operations, briefly

A client that sends only the hash of an operation it registered at build
time cannot send any other: the strongest limit on what it can ask. Yoga's
[persisted operations plugin](https://the-guild.dev/graphql/yoga-server/docs/features/persisted-operations)
works as it does elsewhere, since it is a Yoga plugin in the route:

```ts
// file: src/persisted.ts
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import type { Plugin } from 'graphql-yoga';

// Hash to document: from a file the build wrote, here a literal.
export const operations = new Map([
	['5f1bb2a0c2a0', '{ notes { text } }'],
]);

// `allowArbitraryOperations: false` refuses any document that was not
// registered, the point of it. Apollo's `extensions.persistedQuery.sha256Hash`
// names the operation.
export const persisted: Plugin = usePersistedOperations({
	allowArbitraryOperations: false,
	getPersistedOperation: (hash) => operations.get(hash) ?? null,
});
```

### Together

```ts
// file: src/production.ts
import { logger } from '@alxia/logger';
import { base } from './context';
import { csrf, jsonOnly } from './csrf';
import { depthLimit } from './depth';
import { introspectionOnlyInDev } from './introspection';
import { limitTo } from './limits';
import { createLoaders } from './loaders';
import { schema } from './schema';
import { graphql } from '@alxia/graphql';

export const production = base.fork()
	.use(logger())
	.use(limitTo(120)) // the probes above it are not counted
	.use(jsonOnly)
	.bodyLimit(100 * 1024) // a body past 100 KiB is refused (a 413), for the routes below
	.plugin((app) =>
		graphql(app, {
			schema,
			context: () => ({ loaders: createLoaders() }),
			logging: false,
			plugins: [depthLimit(8), introspectionOnlyInDev, csrf],
		}),
	);
```

A spec proves each point, in process. The app above has the real schema and
the real viewer; a small schema with a field that throws and a type that
nests itself shows what the real one has no field for.

```ts
// file: src/hardening.spec.ts
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';
import { base } from './context';
import { invalid, notFound } from './errors';
import { introspectionOnlyInDev } from './introspection';
import { depthLimit } from './depth';
import { jwt } from './jwt';
import { limitTo } from './limits';
import { createLoaders } from './loaders';
import { operations, persisted } from './persisted';
import { production } from './production';
import { schema } from './schema';

type Answer = { data?: unknown; errors?: { message: string; extensions?: Record<string, unknown> }[] };

function post(app: { request: typeof production.request }, body: unknown, headers: Record<string, string> = {}) {
	return app.request('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-csrf': '1', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

// A schema with what the real one lacks: a field that throws, a refusal for
// the client, and a type that contains itself.
const node = { name: 'root', get child(): unknown { return node; } };
const tiny = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { hello: String! boom: String! missing: String! bad: String! tree: Node! }
		type Node { name: String! child: Node! }
	`,
	resolvers: {
		Query: {
			hello: () => 'hi',
			boom: () => { throw new Error('connection string postgres://admin:hunter2@db'); },
			missing: () => { throw notFound('thing'); },
			bad: () => { throw invalid('Not an email', 'email'); },
			tree: () => node,
		},
	},
});

describe('rate limit', () => {
	test('a viewer and an address each have an allowance, and a batch is one request', async () => {
		const app = base.fork().use(limitTo(2)).plugin((app) =>
			graphql(app, {
				schema,
				context: () => ({ loaders: createLoaders() }),
				logging: false,
				batching: { limit: 5 },
			}),
		);
		const server = app.listen({ port: 0, signals: false });
		const url = `${server.url.href}graphql`;
		const send = (body: unknown, token?: string) =>
			fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
				body: JSON.stringify(body),
			});
		try {
			const ada = await jwt.sign({ sub: '1' });
			const grace = await jwt.sign({ sub: '2' });
			const three = Array.from({ length: 3 }, () => ({ query: '{ me { name } }' }));
			expect((await send(three, ada)).status).toBe(200); // three operations, one request
			expect((await send(three, ada)).status).toBe(200);
			const refused = await send(three, ada);
			expect(refused.status).toBe(429);
			expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
			expect((await send(three, grace)).status).toBe(200); // another viewer, another allowance
			await send({ query: '{ notes { text } }' });
			await send({ query: '{ notes { text } }' });
			expect((await send({ query: '{ notes { text } }' })).status).toBe(429); // no viewer: by address
		} finally {
			await server.stop(true);
		}
	});
});

describe('depth', () => {
	test('a document nested deeper than the limit is refused before it runs', async () => {
		const app = alxia().plugin((app) => graphql(app, { schema: tiny, logging: false, plugins: [depthLimit(2)] }));
		const deep = (await (await post(app, { query: '{ tree { child { child { child { name } } } } }' })).json()) as Answer;
		expect(deep.errors?.[0]?.message).toContain('exceeds maximum operation depth');
		const shallow = (await (await post(app, { query: '{ tree { name } }' })).json()) as Answer;
		expect(shallow.data).toEqual({ tree: { name: 'root' } });
	});
});

describe('introspection', () => {
	const query = '{ __schema { queryType { name } } }';

	test('is refused outside development, and answers in it', async () => {
		const plugins = [introspectionOnlyInDev];
		const deployed = alxia().plugin((app) => graphql(app, { schema: tiny, logging: false, plugins }));
		const refused = (await (await post(deployed, { query })).json()) as Answer;
		expect(refused.errors?.[0]?.message).toContain('introspection');
		const dev = alxia({ dev: true }).plugin((app) => graphql(app, { schema: tiny, logging: false, plugins }));
		expect(((await (await post(dev, { query })).json()) as Answer).data).toEqual({ __schema: { queryType: { name: 'Query' } } });
	});

	test('the real app refuses it too', async () => {
		const refused = (await (await post(production, { query })).json()) as Answer;
		expect(refused.errors?.[0]?.message).toContain('introspection');
	});
});

describe('errors', () => {
	const app = alxia().plugin((app) => graphql(app, { schema: tiny, logging: false }));
	const ask = async (field: string) => (await (await post(app, { query: `{ ${field} }` })).json()) as Answer;

	test('an Error is masked, a GraphQLError reaches the client with its extensions', async () => {
		const masked = await ask('boom');
		expect(masked.errors?.[0]?.message).toBe('Unexpected error.');
		expect(JSON.stringify(masked)).not.toContain('hunter2');
		expect((await ask('bad')).errors?.[0]).toMatchObject({
			message: 'Not an email',
			extensions: { code: 'BAD_USER_INPUT', field: 'email' },
		});
	});

	test('extensions.http.status is the HTTP status too', async () => {
		const response = await post(app, { query: '{ missing }' });
		expect(response.status).toBe(404);
		expect(((await response.json()) as Answer).errors?.[0]?.extensions?.['code']).toBe('NOT_FOUND');
	});
});

describe('the body, and CSRF', () => {
	test('a body past the limit is refused, and no operation runs', async () => {
		const response = await post(production, { query: `{ me { name } } # ${'x'.repeat(200 * 1024)}` });
		expect(response.status).toBe(413); // core's answer, as on any route
		expect(((await response.json()) as Answer).data).toBeUndefined();
	});

	test('a request with no CSRF header is refused, a form is a 415, JSON with the header runs', async () => {
		expect((await production.request('/graphql?query={me{name}}')).status).toBe(403);
		const form = await post(production, 'query=%7Bme%7Bname%7D%7D', { 'content-type': 'application/x-www-form-urlencoded' });
		expect(form.status).toBe(415);
		expect(((await (await post(production, { query: '{ me { name } }' })).json()) as Answer).data).toEqual({ me: null });
	});
});

describe('persisted operations', () => {
	test('a registered hash runs on alxia, an arbitrary document does not', async () => {
		const app = base.fork().plugin((app) =>
			graphql(app, { schema, context: () => ({ loaders: createLoaders() }), logging: false, plugins: [persisted] }),
		);
		const [hash] = [...operations.keys()];
		const known = (await (await post(app, { extensions: { persistedQuery: { version: 1, sha256Hash: hash } } })).json()) as Answer;
		expect(known.data).toEqual({ notes: [] });
		const arbitrary = (await (await post(app, { query: '{ notes { text } }' })).json()) as Answer;
		expect(arbitrary.errors?.[0]?.message).toMatch(/persisted/i);
	});
});
```

## Reference

- [Mounting the endpoint](../../packages/graphql/docs/guide/endpoint.md):
  options, where it is served, what it answers, errors, health and shutdown
- [The typed context](../../packages/graphql/docs/guide/context.md):
  `GraphQLContext`, headers and cookies from a resolver, a token with
  `@alxia/jwt`
- [Yoga's plugins and options](../../packages/graphql/docs/guide/yoga.md):
  masked errors, batching, subscriptions, depth limits, response caching
- [Harden it for production](../../packages/graphql/docs/guide/production.md):
  the guide page of [section 7](#7-harden-it-for-production)
- [GraphiQL and Apollo Sandbox](../../packages/graphql/docs/guide/ide.md)
- [GraphQL over WebSocket](../../packages/graphql/docs/guide/websockets.md):
  `ws: true`, Apollo Client's and urql's WebSocket links
- [The operation in the log and the trace](../../packages/logger/docs/guide.md#a-graphql-operation)
- [Health and shutdown](../../packages/core/docs/guide/health-and-shutdown.md#graphql)
- [Errors](../../packages/core/docs/guide/errors.md#graphql),
  [Authentication](authentication.md), [Testing](testing.md),
  [Deploying](deploying.md)
- [`@alxia/graphql` troubleshooting](../../packages/graphql/docs/troubleshooting.md)

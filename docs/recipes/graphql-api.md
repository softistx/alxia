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
import { alxia, defineMiddleware, health } from '@alxia/core';
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

// The base: what every resolver reads. The probes come first, so they run
// no middleware and need no token; then `db` and `viewer` for the rest.
export const base = alxia({ errors: 'problem' })
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
export const app = base.use(logger()).plugin((app) =>
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
const app = base.use(tracing).use(logger()).plugin((app) => graphql(app, { schema }));
```

- A batched body (`batching: true`, an array) is one line and one span: the
  type is `batch` and the name lists every operation's, `GetNotes,AddNote`.
- A request refused before it executes (a syntax error, a document that
  fails validation) names no operation. An anonymous one has a type alone.
- An operation over `ws: true` is not logged or spanned yet: only the
  upgrade is, and the socket's operations are on the roadmap.

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

## Reference

- [Mounting the endpoint](../../packages/graphql/docs/guide/endpoint.md):
  options, where it is served, what it answers, errors, health and shutdown
- [The typed context](../../packages/graphql/docs/guide/context.md):
  `GraphQLContext`, headers and cookies from a resolver, a token with
  `@alxia/jwt`
- [Yoga's plugins and options](../../packages/graphql/docs/guide/yoga.md):
  masked errors, batching, subscriptions, depth limits, response caching
- [GraphiQL and Apollo Sandbox](../../packages/graphql/docs/guide/ide.md)
- [GraphQL over WebSocket](../../packages/graphql/docs/guide/websockets.md):
  `ws: true`, Apollo Client's and urql's WebSocket links
- [The operation in the log and the trace](../../packages/logger/docs/guide.md#a-graphql-operation)
- [Health and shutdown](../../packages/core/docs/guide/health-and-shutdown.md#graphql)
- [Errors](../../packages/core/docs/guide/errors.md#graphql),
  [Authentication](authentication.md), [Testing](testing.md),
  [Deploying](deploying.md)
- [`@alxia/graphql` troubleshooting](../../packages/graphql/docs/troubleshooting.md)

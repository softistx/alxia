import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention';
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import { parse, type TypedQueryDocumentNode } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { graphql } from '../graphql';
import { graphqlClient } from './client';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query {
			hello(name: String = "world"): String!
		}
	`,
	resolvers: {
		Query: { hello: (_, { name }: { name: string }) => `hello ${name}` },
	},
});

const HELLO = 'query Hello($name: String) { hello(name: $name) }';
const operations = new Map([
	['hash-hello', HELLO],
	['id-hello', HELLO],
]);

const open = alxia().plugin((app) => graphql(app, { schema, logging: false }));
/** Only what is registered runs; an operation's id is Yoga's default. */
const registered = alxia().plugin((app) =>
	graphql(app, {
		schema,
		logging: false,
		plugins: [
			useCSRFPrevention({ requestHeaders: ['x-csrf'] }),
			usePersistedOperations({
				allowArbitraryOperations: false,
				getPersistedOperation: (hash) => operations.get(hash) ?? null,
			}),
		],
	}),
);
/** An app that reads the id from its own extension. */
const byId = alxia().plugin((app) =>
	graphql(app, {
		schema,
		logging: false,
		plugins: [
			usePersistedOperations({
				allowArbitraryOperations: false,
				extractPersistedOperationId: ({ extensions }) =>
					typeof extensions?.['documentId'] === 'string'
						? extensions['documentId']
						: null,
				getPersistedOperation: (id) => operations.get(id) ?? null,
			}),
		],
	}),
);

describe('graphqlClient, GET', () => {
	test('a query in the URL, with no body and no content type', async () => {
		const requests: Request[] = [];
		const spy = {
			fetch: (request: Request) => {
				requests.push(request);
				return open.fetch(request);
			},
		};
		const result = await graphqlClient(spy).query('{ hello }', {
			method: 'GET',
		});
		expect(result.data).toEqual({ hello: 'hello world' });
		const [request] = requests;
		expect(request?.method).toBe('GET');
		expect(new URL(request?.url ?? '').searchParams.get('query')).toBe(
			'{ hello }',
		);
		expect(request?.headers.has('content-type')).toBe(false);
	});

	test('variables, operationName and extensions are JSON in the URL', async () => {
		const urls: URL[] = [];
		const spy = {
			fetch: (request: Request) => {
				urls.push(new URL(request.url));
				return open.fetch(request);
			},
		};
		const two = `${HELLO} query Other { hello(name: "x") }`;
		const client = graphqlClient(spy, { method: 'GET' });
		const first = await client.query(two, {
			operationName: 'Hello',
			variables: { name: 'Ada' },
			extensions: { trace: true },
		});
		expect(first.data).toEqual({ hello: 'hello Ada' });
		const params = urls[0]?.searchParams;
		expect(params?.get('variables')).toBe('{"name":"Ada"}');
		expect(params?.get('operationName')).toBe('Hello');
		expect(params?.get('extensions')).toBe('{"trace":true}');
		const other = await client.query(two, { operationName: 'Other' });
		expect(other.data).toEqual({ hello: 'hello x' });
	});

	test('a call picks its method over the client', async () => {
		const client = graphqlClient(open, { method: 'GET' });
		expect((await client.query('{ hello }')).status).toBe(200);
		const post = await client.query('{ hello }', { method: 'POST' });
		expect(post.response.headers.get('content-type')).toContain('json');
		expect(post.data).toEqual({ hello: 'hello world' });
	});
});

describe('graphqlClient, persisted operations', () => {
	const csrf = { headers: { 'x-csrf': '1' } };

	test('a hash alone, over POST and over GET', async () => {
		const client = graphqlClient(registered, csrf);
		for (const method of ['POST', 'GET'] as const) {
			const result = await client.query<{ hello: string }>({
				persisted: 'hash-hello',
				variables: { name: 'Ada' },
				method,
			});
			expect(result.errors).toBeUndefined();
			expect(result.data).toEqual({ hello: 'hello Ada' });
		}
	});

	test('only the hash is sent: no query in the body, nor in the URL', async () => {
		const seen: string[] = [];
		const spy = {
			fetch: async (request: Request) => {
				const body = await request.clone().text();
				seen.push(`${new URL(request.url).search}|${body}`);
				return registered.fetch(request);
			},
		};
		const client = graphqlClient(spy, csrf);
		await client.query({ persisted: 'hash-hello' });
		await client.query({ persisted: 'hash-hello', method: 'GET' });
		const sent = JSON.stringify({
			extensions: { persistedQuery: { version: 1, sha256Hash: 'hash-hello' } },
		});
		expect(seen[0]).toBe(`|${sent}`);
		expect(seen[1]).toStartWith('?extensions=');
		expect(seen[1]).not.toContain('query=');
	});

	test('an id the app reads from its own extension', async () => {
		const result = await graphqlClient(byId).query({
			extensions: { documentId: 'id-hello' },
			variables: { name: 'Grace' },
		});
		expect(result.data).toEqual({ hello: 'hello Grace' });
	});

	test('an unknown hash is the server error, a document is refused', async () => {
		const client = graphqlClient(registered, csrf);
		const unknown = await client.query({ persisted: 'nope' });
		expect(unknown.data).toBeUndefined();
		expect(unknown.errors?.[0]?.message).toBe('PersistedQueryNotFound');
		expect(unknown.errors?.[0]?.extensions?.code).toBe(
			'PERSISTED_QUERY_NOT_IN_LIST',
		);
		const arbitrary = await client.query('{ hello }');
		expect(arbitrary.errors?.[0]?.message).toBe('PersistedQueryOnly');
	});

	test('a document and a hash are both sent', async () => {
		const result = await graphqlClient(open).query(HELLO, {
			persisted: 'whatever',
			variables: { name: 'Ada' },
		});
		expect(result.data).toEqual({ hello: 'hello Ada' });
	});
});

describe('graphqlClient, CSRF', () => {
	test('it sends no CSRF header of its own: a GET is refused until the call adds it', async () => {
		const refused = await graphqlClient(registered).query({
			persisted: 'hash-hello',
			method: 'GET',
		});
		expect(refused.status).toBe(403);
		expect(refused.errors?.[0]?.message).toContain('CSRF');
		const allowed = await graphqlClient(registered).query({
			persisted: 'hash-hello',
			method: 'GET',
			headers: { 'x-csrf': '1' },
		});
		expect(allowed.status).toBe(200);
	});

	test('a JSON POST passes the plugin with no header, as a browser needs a preflight for it', async () => {
		const result = await graphqlClient(registered).query({
			persisted: 'hash-hello',
		});
		expect(result.status).toBe(200);
	});
});

describe('graphqlClient, types', () => {
	test('a typed document types data and variables; a hash alone names TData', async () => {
		const typed = parse(HELLO) as TypedQueryDocumentNode<
			{ hello: string },
			{ name?: string }
		>;
		const client = graphqlClient(open);
		const result = await client.query(typed, {
			variables: { name: 'Ada' },
			method: 'GET',
		});
		expectTypeOf(result.data).toEqualTypeOf<
			{ hello: string } | null | undefined
		>();
		// @ts-expect-error the variables are the document's
		client.query(typed, { variables: { name: 1 } });

		const alone = await graphqlClient(registered).query<{ hello: string }>({
			persisted: 'hash-hello',
		});
		expectTypeOf(alone.data).toEqualTypeOf<
			{ hello: string } | null | undefined
		>();
		// @ts-expect-error a call with no document names its hash
		client.query({ variables: {} });
	});
});

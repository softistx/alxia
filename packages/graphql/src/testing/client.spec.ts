import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { parse, type TypedQueryDocumentNode } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { graphql } from '../graphql';
import { graphqlClient, type QueryDocument } from './client';

const schema = createSchema<{ who: string | null }>({
	typeDefs: /* GraphQL */ `
		type Query {
			hello(name: String!): String!
			who: String
			boom: String
		}
	`,
	resolvers: {
		Query: {
			hello: (_, { name }: { name: string }) => `hello ${name}`,
			who: (_, __, context) => context.who,
			boom: () => {
				throw new Error('nope');
			},
		},
	},
});

const base = () =>
	alxia()
		.bodyLimit(512)
		.derive(({ request }) => ({
			who: request.headers.get('authorization')?.replace('Bearer ', '') ?? null,
		}));
const serve = (path: `/${string}` = '/graphql') =>
	base().plugin((app) =>
		graphql(app, {
			schema,
			logging: false,
			path,
		}),
	);
const app = serve();

const HELLO = 'query Hello($name: String!) { hello(name: $name) }';

describe('graphqlClient', () => {
	test('data, with the status', async () => {
		const result = await graphqlClient(app).query('{ __typename }');
		expect(result.status).toBe(200);
		expect(result.data).toEqual({ __typename: 'Query' });
		expect(result.errors).toBeUndefined();
		expect(result.response.headers.get('content-type')).toContain('json');
	});

	test('variables and operationName', async () => {
		const client = graphqlClient(app);
		const { data } = await client.query(HELLO, { variables: { name: 'Ada' } });
		expect(data).toEqual({ hello: 'hello Ada' });
		const two = `${HELLO} query Other { hello(name: "x") }`;
		const named = await client.query(two, { operationName: 'Other' });
		expect(named.data).toEqual({ hello: 'hello x' });
	});

	test('errors stay in errors, with the data that resolved', async () => {
		const result = await graphqlClient(app).query('{ boom }');
		expect(result.status).toBe(200);
		expect(result.errors).toHaveLength(1);
		expect(result.data).toEqual({ boom: null });
	});

	test('headers: the client carries them, a call adds or replaces', async () => {
		const client = graphqlClient(app, {
			headers: { authorization: 'Bearer ada' },
		});
		expect((await client.query('{ who }')).data).toEqual({ who: 'ada' });
		const other = await client.query('{ who }', {
			headers: { authorization: 'Bearer grace' },
		});
		expect(other.data).toEqual({ who: 'grace' });
		expect((await graphqlClient(app).query('{ who }')).data).toEqual({
			who: null,
		});
	});

	test('a custom path', async () => {
		const custom = serve('/api/graphql');
		const result = await graphqlClient(custom, {
			path: '/api/graphql',
		}).query('{ __typename }');
		expect(result.data).toEqual({ __typename: 'Query' });
		expect((await graphqlClient(custom).query('{ __typename }')).status).toBe(
			404,
		);
	});

	test('a typed document, from graphql or from the code generator', async () => {
		const typed = parse(HELLO) as TypedQueryDocumentNode<
			{ hello: string },
			{ name: string }
		>;
		const client = graphqlClient(app);
		const result = await client.query(typed, { variables: { name: 'Ada' } });
		expectTypeOf(result.data).toEqualTypeOf<
			{ hello: string } | null | undefined
		>();
		expect(result.data?.hello).toBe('hello Ada');

		// What @graphql-typed-document-node/core declares, with no import of it.
		type Generated = QueryDocument<{ hello: string }, { name: string }>;
		const generated = parse(HELLO) as Generated;
		const again = await client.query(generated, {
			variables: { name: 'Grace' },
		});
		expectTypeOf(again.data).toEqualTypeOf<
			{ hello: string } | null | undefined
		>();
		expect(again.data).toEqual({ hello: 'hello Grace' });
		// @ts-expect-error the variables are the document's
		client.query(typed, { variables: { name: 1 } });
	});

	test('the HTTP status: 400 for an operation name the document lacks', async () => {
		const result = await graphqlClient(app).query(HELLO, {
			operationName: 'Nope',
			variables: { name: 'Ada' },
		});
		expect(result.status).toBe(400);
		expect(result.errors?.[0]?.extensions?.['code']).toBe(
			'OPERATION_RESOLUTION_FAILURE',
		);
	});

	test('the HTTP status: 413 over the body limit, with no JSON to read', async () => {
		const result = await graphqlClient(app).query(
			`{ hello(name: "${'x'.repeat(600)}") }`,
		);
		expect(result.status).toBe(413);
		expect(result.response.ok).toBe(false);
	});
});

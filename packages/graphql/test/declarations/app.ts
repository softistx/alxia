// An app serving GraphQL, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/graphql`, `@alxia/core` and `graphql-yoga` alone (TS2883
// otherwise).
import { alxia, problem } from '@alxia/core';
import { type GraphQLContext, graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

const base = alxia()
	.decorate({ users: new Map([['1', 'Ada']]) })
	.derive(({ request }) => ({ viewer: request.headers.get('x-user') }));

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: 'type Query { me: String, user(id: ID!): String }',
	resolvers: {
		Query: {
			me: (_, __, context) => context.viewer,
			user: (_, args: { id: string }, context) =>
				context.users.get(args.id) ?? null,
		},
	},
});

export function served() {
	return base.use((app) => graphql(app, { schema }));
}

export function servedAt() {
	return base
		.use((app) =>
			graphql(app, { schema, path: '/api/graphql', ide: 'apollo-sandbox' }),
		)
		.get('/health', ({ reply }) => reply(200, 'ok'));
}

export function servedIn() {
	return alxia({ prefix: '/v1' })
		.decorate({ users: new Map([['1', 'Ada']]) })
		.derive(({ request }) => ({ viewer: request.headers.get('x-user') }))
		.group('/data', (group) => graphql(group, { schema, ide: false }));
}

// Behind a guard that may answer 401, a body limit and a refusal hook: the
// endpoint's routes then carry the app's shortcuts.
export function guarded() {
	return alxia()
		.bodyLimit(1024)
		.onRefusal(() => problem({ status: 400 }))
		.decorate({ users: new Map([['1', 'Ada']]) })
		.derive(({ request, reply }) => {
			const viewer = request.headers.get('x-user');
			if (viewer === null)
				return reply(401, { error: 'unauthorized' as const });
			return { viewer };
		})
		.use((app) => graphql(app, { schema }));
}

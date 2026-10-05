import { alxia, defineMiddleware, problem, refusalOf, responds, settle, validate } from '../../src/index';
import { z } from 'zod';

type User = { id: string; name: string };
declare function session(r: Request): Promise<User | null>;
declare function createPost(u: User, b: { title: string }): { title: string };

const Post = z.object({ title: z.string().min(1) });

const auth = defineMiddleware(async ({ request, reply }, next) => {
	const user = await session(request);
	if (!user) return reply(401, { error: 'unauthorized' as const });
	return next({ user });
});

export const app = alxia().post(
	'/posts',
	{ bodyLimit: 1024 * 1024, detail: { summary: 'Create a post' } },
	async (_ctx, next) => {
		const started = performance.now();
		const response = await next();
		response.headers.set('server-timing', `app;dur=${performance.now() - started}`);
		return response;
	},
	auth,
	validate({ body: Post }),
	responds({ 201: Post }),
	({ user, body, reply }) => reply(201, createPost(user, body)),
);

const admin = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-admin') ? next() : reply(403, { error: 'forbidden' as const }),
);
const timed = defineMiddleware(async (_ctx, next) => {
	const response = await next();
	response.headers.set('x-timed', '1');
	return response;
});
const loadTeams = defineMiddleware<{ user: { id: string } }>()(({ user }, next) =>
	next({ teams: [`${user.id}'s team`] }),
);

alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.use(({ request, reply }, next) => {
		const id = request.headers.get('x-user');
		return id ? next({ user: { id } }) : reply(401, { error: 'unauthorized' as const });
	})
	.use('/admin', admin)
	.get('/me', ({ user, reply }) => reply(200, user))
	.get('/admin/stats', timed, ({ reply }) => reply(200, { users: 1 }))
	.group('/teams', (teams) =>
		teams.use(loadTeams).get('/', ({ teams, reply }) => reply(200, teams)),
	);

const poweredBy = defineMiddleware(async (ctx, next) => {
	const response = await settle(ctx, next());
	response.headers.set('x-powered-by', 'alxia');
	return response;
});
const JmapRequest = z.object({ using: z.array(z.string()), methodCalls: z.array(z.unknown()) });
const jmapErrors = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal === undefined) throw error;
		return refusal.kind === 'body_limit'
			? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
			: problem({ type: 'x', status: 400, detail: `the ${refusal.part} is invalid` });
	}
});
alxia().use(poweredBy).use(jmapErrors)
	.post('/jmap', validate({ body: JmapRequest }), ({ reply }) => reply(200, { methodResponses: [] }));
const refusals = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind === 'validation') return reply(422, { detail: `the ${refusal.part} is invalid` });
		if (refusal?.kind === 'body_limit') return reply(413, { limit: refusal.limit });
		throw error;
	}
});
alxia()
	.use(refusals)
	.post('/notes', { bodyLimit: 64 * 1024 }, validate({ body: z.object({ text: z.string() }) }), ({ reply }) =>
		reply(201, 'ok'),
	);

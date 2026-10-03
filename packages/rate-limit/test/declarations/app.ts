// An app behind the limit, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/rate-limit` and `@alxia/core` alone (TS2883 otherwise).
import { alxia, type BaseContext } from '@alxia/core';
import { MemoryStore, rateLimit } from '@alxia/rate-limit';

export function limited() {
	return alxia()
		.use(rateLimit({ limit: 100, windowMs: 60_000, store: new MemoryStore() }))
		.get('/', ({ rateLimit: info, reply }) => reply(200, info?.remaining ?? 0));
}

export function limitedByUser() {
	return alxia()
		.derive(() => ({ user: { id: 'u' } }))
		.use(
			rateLimit<{ user: { id: string } }>({
				limit: 10,
				windowMs: 1_000,
				key: ({ user }) => user.id,
				headers: 'legacy',
			}),
		)
		.post('/', ({ reply }) => reply(201, 'ok'));
}

export function limitedPlugin() {
	return rateLimit({ limit: 1, windowMs: 1_000 });
}

export function limitedOn<Ctx extends BaseContext>(
	skip: (ctx: Ctx) => boolean,
) {
	return rateLimit<Ctx>({ limit: 1, windowMs: 1_000, skip });
}

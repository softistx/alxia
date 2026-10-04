// Schemas built with the coercions, and an app reading them, behind exported
// values whose types are inferred: a declaration build must be able to name
// each one through `@alxia/zod`, `@alxia/core` and `zod` alone (TS2883
// otherwise).
import { alxia, validate } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

export const Query = z.object({
	page: zq.int(),
	price: zq.number(),
	active: zq.boolean(),
	since: zq.date(),
	tags: zq.array(z.string()),
	filter: zq.json(z.object({ name: z.string() })),
});

export function listed() {
	return alxia().get('/items', validate({ query: Query }), ({ query, reply }) =>
		reply(200, { page: query.page, tags: query.tags }),
	);
}

export function listOf<S extends z.ZodType>(item: S) {
	return zq.array(item);
}

export function jsonOf<S extends z.ZodType>(schema: S) {
	return zq.json(schema);
}

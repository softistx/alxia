// The mistakes a call reports beyond what a middleware reads, one per
// line, in the order `use-messages.spec.ts` reads them: each a single
// error naming the cause.
import {
	alxia,
	defineMiddleware,
	type Empty,
	type Middleware,
	responds,
	validate,
} from '@alxia/core';
import { z } from 'zod';

const m = defineMiddleware<Empty>()((_ctx, next) => next());
const ok = () => new Response('ok');
declare function audit(options?: { level?: string }): Middleware<Empty>;

// 1: a route, a ninth middleware.
alxia().get('/a', m, m, m, m, m, m, m, m, m, ok);
// 2: a route with options, a ninth middleware.
alxia().post('/b', { bodyLimit: 1024 }, m, m, m, m, m, m, m, m, m, ok);
// 3: a socket route, a ninth middleware.
alxia().ws('/c', m, m, m, m, m, m, m, m, m, { message: () => {} });
// 4: use, a validate().
alxia().use(validate({}));
// 5: use, a responds().
alxia().use(responds({ 200: z.string() }));
// 6: use, a factory given uncalled.
alxia().use(audit);
// 7: a route, a factory given uncalled.
alxia().get('/d', audit, ok);

// The mistakes a middleware form reports, one per line, in the order
// `use-messages.spec.ts` reads them: each a single error naming the cause.
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';

const needsUser = defineMiddleware<{ user: { id: string } }>()(
	({ user }, next) => next({ name: user.id }),
);
const numericUser = defineMiddleware((_ctx, next) => next({ user: { id: 1 } }));
const ok = () => new Response('ok');

// 1: use, a middleware the app's context does not give.
alxia().use(needsUser);
// 2: a route, the middleware first.
alxia().get('/a', needsUser, ok);
// 3: a route, the middleware after one that gives something else.
alxia().get('/b', numericUser, needsUser, ok);
// 4: a route with options.
alxia().post('/c', { bodyLimit: 1024 }, needsUser, ok);
// 5: a socket route.
alxia().ws('/d', needsUser, { message: () => {} });
// 6: a path parameter the path does not have.
alxia().get('/e', validate({ params: z.object({ id: z.string() }) }), ok);

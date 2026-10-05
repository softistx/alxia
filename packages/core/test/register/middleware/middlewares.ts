// A middleware file: `defineAppMiddleware(fn)` reads the registered
// context with no generic and no import of the app; `defineMiddleware(fn)`
// reads the base context alone, as an inline middleware does.
import { alxia, defineAppMiddleware, defineMiddleware } from '@alxia/core';
import { base } from './context';

export const profile = defineAppMiddleware(
	async ({ db, user, requestId }, next) =>
		next({ profile: { ...db.find(user.id), requestId } }),
);

// Typed into the handler after it, on the app the context is registered by.
base.get('/me', profile, ({ profile, reply }) => reply(200, profile.name));

// @ts-expect-error: an app that does not give `db` and `user` refuses it
alxia().get('/me', profile, ({ reply }) => reply(200, 'x'));

// @ts-expect-error: nor does use()
alxia().use(profile);

// `defineMiddleware(fn)` does not read the registered context: no trap
// where a file of the base would read `BaseContext` and others the base.
// @ts-expect-error: `db` is not on the base context
defineMiddleware(({ db }, next) => next({ found: db }));

// Given on any app, as an inline middleware is.
const stamp = defineMiddleware((_ctx, next) => next({ at: 1 }));
alxia().get('/at', stamp, ({ at, reply }) => reply(200, String(at)));
base.get('/stamp', stamp, ({ at, reply }) => reply(200, String(at)));

// The explicit generic still names what it reads beyond the base.
const plain = defineMiddleware<{ requestId: string }>()(({ requestId }, next) =>
	next({ traced: requestId }),
);
base.get('/trace', plain, ({ traced, reply }) => reply(200, traced));

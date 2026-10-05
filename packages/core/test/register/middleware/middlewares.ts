// A middleware file: `defineMiddleware(fn)` reads the registered context
// with no generic and no import of the app.
import { alxia, defineMiddleware } from '@alxia/core';
import { base } from './context';

export const profile = defineMiddleware(async ({ db, user, requestId }, next) =>
	next({ profile: { ...db.find(user.id), requestId } }),
);

// Typed into the handler after it, on the app the context is registered by.
base.get('/me', profile, ({ profile, reply }) => reply(200, profile.name));

// @ts-expect-error: an app that does not give `db` and `user` refuses it
alxia().get('/me', profile, ({ reply }) => reply(200, 'x'));

// @ts-expect-error: nor does use()
alxia().use(profile);

// The explicit generic still overrides it.
const plain = defineMiddleware<{ requestId: string }>()(({ requestId }, next) =>
	next({ traced: requestId }),
);
base.get('/trace', plain, ({ traced, reply }) => reply(200, traced));

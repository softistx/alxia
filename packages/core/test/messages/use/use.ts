// Two mistakes `app.use` reports: what its spec reads of the message.
import { alxia, defineMiddleware } from '@alxia/core';

const needsUser = defineMiddleware<{ user: { id: string } }>()((_ctx, next) =>
	next(),
);

// A middleware the app's context does not give: the middleware form first.
alxia().use(needsUser);

// A plain (ctx, next) function: named, the mark says what makes one.
alxia().use((_ctx: unknown, next: () => Promise<Response>) => next());

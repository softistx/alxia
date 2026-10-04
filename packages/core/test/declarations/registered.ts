// `Register` augmented, and what reads it, behind exported values whose
// types are inferred: a declaration build must name each one through
// `@alxia/core` alone (TS2883 otherwise). This file is in no typecheck of
// the package, whose specs read `Register` unregistered: only the
// declaration build of the installed tarball compiles it, in one program
// with the other fixtures here: they compile with `Register` augmented too,
// so a fixture that needs it unregistered belongs in a package of its own.
import {
	type AppContext,
	alxia,
	defineMiddleware,
	defineRoutes,
} from '@alxia/core';

export const base = alxia()
	.decorate({ greeting: 'hello' })
	.derive(() => ({ user: { id: 'ada' } }));

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

export const owner = defineMiddleware<AppContext>()(({ user }, next) =>
	next({ owner: user.id }),
);

export function todos() {
	return defineRoutes('/todos')
		.use(owner)
		.get('/', ({ greeting, owner, reply }) =>
			reply(200, `${greeting} ${owner}`),
		);
}

export function served() {
	return base.use(todos());
}

export function context(ctx: AppContext) {
	return ctx;
}

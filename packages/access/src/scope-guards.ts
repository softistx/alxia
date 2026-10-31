import { type GuardContext, requireMember, requirePermission } from './guards';

type Held = { member: unknown };

/**
 * The two guards of a module. `read` and `write` are the guards each runs
 * first (`requireMember`, `requirePermission`); `reading` and `writing` give
 * what `select` makes of the scope they return (by default the scope itself),
 * for a service built from the request's scope.
 */
export function scopeOf<C extends { viewer: unknown }, S extends Held, T = S>(
	guards: {
		read: (ctx: C) => Promise<S>;
		write: (ctx: C) => Promise<S>;
	},
	select: (scope: S) => T = (scope) => scope as unknown as T,
) {
	return {
		reading: async (ctx: C) => select(await guards.read(ctx)),
		writing: async (ctx: C) => select(await guards.write(ctx)),
	};
}

/**
 * The usual guards: the `read` permission reads, the `write` one writes. Both
 * are permissions a module declares (`sales:read`, `sales:manage`).
 */
export function permissionsReadWrite<S extends Held, T = S>(
	read: string,
	write: string,
	select?: (scope: S) => T,
) {
	return scopeOf<GuardContext<S>, S, T>(
		{
			read: (ctx) => requirePermission(ctx, read),
			write: (ctx) => requirePermission(ctx, write),
		},
		select,
	);
}

/** Guards for a module any member may read, and a permission writes. */
export function membersReadPermissionWrites<S extends Held, T = S>(
	write: string,
	select?: (scope: S) => T,
) {
	return scopeOf<GuardContext<S>, S, T>(
		{
			read: (ctx) => requireMember(ctx),
			write: (ctx) => requirePermission(ctx, write),
		},
		select,
	);
}

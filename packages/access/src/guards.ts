import type { Access, Viewer } from './catalogue';
import { forbidden, unauthenticated } from './errors';
import type { Permission } from './permission';

/**
 * What a guard reads: the request's viewer, the catalogue and the request's
 * scope (a `TenantScope` of `@alxia/tenancy`, resolved once, from
 * `lazyScope`). Generic over the scope, so a host keeps its own.
 */
export interface GuardContext<S extends { member: unknown }> {
	readonly viewer: Viewer | null;
	readonly access: Pick<Access<string, S['member']>, 'holds'>;
	readonly scope: () => Promise<S>;
}

/** The signed-in viewer, or a 401. */
export function requireViewer<V extends Viewer>(ctx: {
	readonly viewer: V | null;
}): V {
	if (!ctx.viewer) throw unauthenticated();
	return ctx.viewer;
}

/**
 * Whether the viewer holds `permission` in the request's tenant, for a flag
 * or a field. No viewer answers false; the scope's own refusals (no tenant,
 * unknown, not a member) are thrown as everywhere.
 */
export async function can<S extends { member: unknown }>(
	ctx: GuardContext<S>,
	permission: Permission,
): Promise<boolean> {
	if (!ctx.viewer) return false;
	const scope = await ctx.scope();
	return ctx.access.holds(scope.member, ctx.viewer, permission);
}

/**
 * What an operation any member may call runs first: the scope when the viewer
 * is a member, whatever their role. Refusals, in order: 401 (no viewer), then
 * the scope's own (400 no tenant named, 404 unknown or not a member: the same
 * answer).
 */
export async function requireMember<S extends { member: unknown }>(
	ctx: GuardContext<S>,
): Promise<S> {
	requireViewer(ctx);
	return ctx.scope();
}

/**
 * What every operation on a tenant's data calls first, and reads its database
 * through: the scope when the viewer holds `permission` in it. Refusals, in
 * order:
 *
 * 1. 401 `auth.errors.unauthenticated`: no viewer;
 * 2. the scope's own: 400 `tenancy.errors.organization-required`, 404
 *    `tenancy.errors.unknown-organization` (unknown, not active, or the viewer
 *    is no member: the same answer, so existence is never probed);
 * 3. 403 `auth.errors.forbidden`: a member whose role lacks `permission`.
 */
export async function requirePermission<S extends { member: unknown }>(
	ctx: GuardContext<S>,
	permission: Permission,
): Promise<S> {
	const viewer = requireViewer(ctx);
	const scope = await ctx.scope();
	if (!(await ctx.access.holds(scope.member, viewer, permission))) {
		throw forbidden(permission);
	}
	return scope;
}

/**
 * Like `requirePermission`, for an operation several permissions open: the
 * viewer needs any of them (the 403 names the first).
 */
export async function requireAnyPermission<S extends { member: unknown }>(
	ctx: GuardContext<S>,
	permissions: readonly [Permission, ...Permission[]],
): Promise<S> {
	const viewer = requireViewer(ctx);
	const scope = await ctx.scope();
	for (const permission of permissions) {
		if (await ctx.access.holds(scope.member, viewer, permission)) return scope;
	}
	throw forbidden(permissions[0]);
}

/**
 * For what belongs to one account (its own notifications, its own profile):
 * the viewer must be `userId`. With `or`, a viewer who holds that permission in
 * the request's tenant is let in too. A grant never opens an own-feed: leave
 * `or` out. Refusals: 401 with no viewer, 403 `auth.errors.forbidden` (the
 * params name `self`, or `or`'s permission).
 */
export async function requireSelf<S extends { member: unknown }>(
	ctx: Pick<GuardContext<S>, 'viewer'> & Partial<GuardContext<S>>,
	userId: string,
	options: { or?: Permission } = {},
): Promise<Viewer> {
	const viewer = requireViewer(ctx);
	if (viewer.id === userId) return viewer;
	const { or } = options;
	if (or !== undefined && ctx.access && ctx.scope) {
		const scope = await ctx.scope();
		if (await ctx.access.holds(scope.member, viewer, or)) return viewer;
	}
	throw forbidden(or ?? 'self');
}

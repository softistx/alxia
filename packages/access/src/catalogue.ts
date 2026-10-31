import type { Module } from '@alxia/modules';
import { AccessCatalogueError } from './errors';
import { isPermission, type Permission } from './permission';

/** The account a request is made by. */
export interface Viewer {
	readonly id: string;
}

export interface AccessOptions<R extends string, M> {
	/** The roles the host supplies, built in. A grant to any other name is a boot error. */
	roles: readonly R[];
	/** The role that holds every declared permission, whatever the grants say. */
	all?: R;
	/**
	 * The role a scope's `member` stands for. By default the member is the role
	 * (`Membership<R>`). A host whose member is a record, or whose store has no
	 * membership (`single`), answers here from the member and the viewer.
	 * `null` or `undefined` holds nothing.
	 */
	roleOf?: (
		member: M,
		viewer: Viewer,
	) => R | null | undefined | Promise<R | null | undefined>;
}

/**
 * The role -> permission matrix every guard reads, built from the modules:
 * `permissions` declares what a module guards, `defaultGrants` says which of
 * the host's roles hold which of them by default.
 */
export interface Access<R extends string = string, M = R> {
	readonly roles: readonly R[];
	/** Every declared permission, in registry order. */
	readonly permissions: readonly Permission[];
	/** The matrix, frozen row by row. */
	readonly matrix: Readonly<Record<R, readonly Permission[]>>;
	/** Whether a role holds a permission. No role holds nothing. */
	roleCan(role: R | null | undefined, permission: string): boolean;
	/** The permissions of a role, in `permissions` order. */
	permissionsOf(role: R | null | undefined): readonly Permission[];
	/** Whether the viewer, as a scope's `member`, holds a permission. */
	holds(member: M, viewer: Viewer, permission: string): Promise<boolean>;
}

/**
 * Builds the catalogue from the module registry; throws an
 * `AccessCatalogueError` at boot for:
 *
 * - a permission that is not `<area>:read|manage`;
 * - a permission declared by two modules;
 * - a grant to a role the host did not supply;
 * - a grant of a permission the granting module does not declare.
 */
export function createAccess<R extends string, M = R>(
	modules: readonly Module[],
	options: AccessOptions<R, M>,
): Access<R, M> {
	const { roles, all } = options;
	if (all !== undefined && !roles.includes(all)) {
		throw new AccessCatalogueError(
			`the role "${all}" that holds every permission is not one of the roles`,
		);
	}
	const declaredBy = new Map<string, string>();
	for (const module of modules) {
		for (const permission of module.permissions ?? []) {
			if (!isPermission(permission)) {
				throw new AccessCatalogueError(
					`module "${module.name}" declares "${permission}", which is not <area>:read or <area>:manage`,
				);
			}
			const first = declaredBy.get(permission);
			if (first !== undefined) {
				throw new AccessCatalogueError(
					`permission "${permission}" is declared by two modules ("${first}" and "${module.name}")`,
				);
			}
			declaredBy.set(permission, module.name);
		}
	}
	const permissions = [...declaredBy.keys()] as Permission[];
	const granted = new Map<string, Set<string>>(
		roles.map((role) => [role, new Set<string>()]),
	);
	for (const module of modules) {
		for (const [role, held] of Object.entries(module.defaultGrants ?? {}) as [
			string,
			readonly string[],
		][]) {
			const row = granted.get(role);
			if (!row) {
				throw new AccessCatalogueError(
					`module "${module.name}" grants to "${role}", which is not one of the host's roles`,
				);
			}
			for (const permission of held) {
				if (declaredBy.get(permission) !== module.name) {
					throw new AccessCatalogueError(
						`module "${module.name}" grants "${permission}", which it does not declare`,
					);
				}
				row.add(permission);
			}
		}
	}
	const matrix = Object.freeze(
		Object.fromEntries(
			roles.map((role) => [
				role,
				Object.freeze(
					role === all
						? [...permissions]
						: permissions.filter((permission) =>
								granted.get(role)?.has(permission),
							),
				),
			]),
		),
	) as Readonly<Record<R, readonly Permission[]>>;
	const rowOf = (role: R | null | undefined): readonly Permission[] =>
		role !== null && role !== undefined && role in matrix ? matrix[role] : [];
	const roleOf =
		options.roleOf ??
		((member: M) =>
			typeof member === 'string' ? (member as unknown as R) : null);
	return {
		roles,
		permissions,
		matrix,
		roleCan: (role, permission) =>
			(rowOf(role) as readonly string[]).includes(permission),
		permissionsOf: rowOf,
		async holds(member, viewer, permission) {
			const role = await roleOf(member, viewer);
			return (rowOf(role) as readonly string[]).includes(permission);
		},
	};
}

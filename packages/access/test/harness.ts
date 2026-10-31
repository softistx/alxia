import { mock } from 'bun:test';
import { type Access, createAccess } from '../src/catalogue';
import type { GuardContext } from '../src/guards';

export const roles = [
	'admin',
	'sales',
	'purchasing',
	'warehouse',
	'accountant',
	'member',
] as const;
export type Role = (typeof roles)[number];

export const ACCOUNT_A = 'a'.repeat(24);

export const viewer = (id = ACCOUNT_A) => ({ id });

/** A refusal the scope itself raises, as `@alxia/tenancy` does. */
export class ScopeRefusal extends Error {
	constructor(
		readonly code: string,
		readonly status: number,
		readonly params: Record<string, string> = {},
	) {
		super(code);
	}
}

export interface FakeScope {
	readonly tenant: { readonly id: string };
	readonly member: Role;
}

/**
 * A request context over a membership table (`held`: tenant -> account -> role).
 * The scope is lazy and kept, as `lazyScope` does; `reads` counts membership reads.
 */
export function context(options: {
	access: Access<Role>;
	tenant?: string;
	viewer?: { id: string } | null;
	held?: Record<string, Record<string, Role>>;
}) {
	const who = options.viewer === undefined ? viewer() : options.viewer;
	const reads = mock(
		(tenant: string, account: string) =>
			options.held?.[tenant]?.[account] ?? null,
	);
	let scope: Promise<FakeScope> | undefined;
	const ctx: GuardContext<FakeScope> & { access: Access<Role> } = {
		viewer: who,
		access: options.access,
		scope() {
			scope ??= (async () => {
				if (options.tenant === undefined) {
					throw new ScopeRefusal('tenancy.errors.organization-required', 400, {
						header: 'x-organization-id',
					});
				}
				const member = who ? reads(options.tenant, who.id) : null;
				if (!member) {
					throw new ScopeRefusal('tenancy.errors.unknown-organization', 404);
				}
				return { tenant: { id: options.tenant }, member };
			})();
			return scope;
		},
	};
	return { ctx, reads };
}

export const accessFor = (modules: Parameters<typeof createAccess>[0]) =>
	createAccess<Role>(modules, { roles, all: 'admin' });

/** What a promise rejects with, as a plain answer; resolves to `null` when it does not reject. */
export async function answerOf(fn: () => Promise<unknown>) {
	try {
		await fn();
		return null;
	} catch (error) {
		const { code, status, params } = error as {
			code: string;
			status: number;
			params: unknown;
		};
		return { code, status, params };
	}
}

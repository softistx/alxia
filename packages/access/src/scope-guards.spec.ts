import { describe, expect, test } from 'bun:test';
import { defineModule } from '@alxia/modules';
import {
	ACCOUNT_A,
	accessFor,
	answerOf,
	context,
	type FakeScope,
	roles,
} from '../test/harness';
import { requireMember, requirePermission } from './guards';
import {
	membersReadPermissionWrites,
	permissionsReadWrite,
	scopeOf,
} from './scope-guards';

const sales = defineModule({
	name: 'sales',
	permissions: ['sales:read', 'sales:manage'],
	defaultGrants: {
		sales: ['sales:read', 'sales:manage'],
		accountant: ['sales:read'],
	},
});
const access = accessFor([sales]);
const T = 'org-1';

describe('scopeOf', () => {
	test('reading and writing run their own guard and give the same scope shape', async () => {
		const calls: string[] = [];
		const { ctx } = context({
			access,
			tenant: T,
			held: { [T]: { [ACCOUNT_A]: 'admin' } },
		});
		const { reading, writing } = scopeOf(
			{
				read: async (c: typeof ctx) => {
					calls.push('read');
					return c.scope();
				},
				write: async (c: typeof ctx) => {
					calls.push('write');
					return c.scope();
				},
			},
			(scope: FakeScope) => ({ tenantId: scope.tenant.id }),
		);
		expect(await reading(ctx)).toEqual({ tenantId: T });
		expect(await writing(ctx)).toEqual({ tenantId: T });
		expect(calls).toEqual(['read', 'write']);
	});

	test('without `select`, the scope itself; a refusal of the guard passes through', async () => {
		const { ctx } = context({
			access,
			tenant: T,
			held: { [T]: { [ACCOUNT_A]: 'admin' } },
		});
		const guards = scopeOf({
			read: (c: typeof ctx) => requireMember(c),
			write: async () => {
				throw new Error('refused');
			},
		});
		expect((await guards.reading(ctx)).member).toBe('admin');
		await expect(guards.writing(ctx)).rejects.toThrow('refused');
	});
});

describe('permissionsReadWrite', () => {
	test('a role needs the read permission to read and the write one to write', async () => {
		const { reading, writing } = permissionsReadWrite(
			'sales:read',
			'sales:manage',
		);
		for (const role of roles) {
			const { ctx } = context({
				access,
				tenant: T,
				held: { [T]: { [ACCOUNT_A]: role } },
			});
			for (const [guard, permission] of [
				[reading, 'sales:read'],
				[writing, 'sales:manage'],
			] as const) {
				const result = await answerOf(() => guard(ctx));
				if (access.roleCan(role, permission)) expect(result).toBeNull();
				else
					expect(result).toMatchObject({
						code: 'auth.errors.forbidden',
						status: 403,
						params: { permission },
					});
			}
		}
	});

	test('both refuse as the guards do: 401 with no viewer, 404 for a non-member', async () => {
		const { reading, writing } = permissionsReadWrite(
			'sales:read',
			'sales:manage',
		);
		for (const guard of [reading, writing]) {
			expect(
				await answerOf(() =>
					guard(context({ access, tenant: T, viewer: null }).ctx),
				),
			).toMatchObject({ code: 'auth.errors.unauthenticated', status: 401 });
			expect(
				await answerOf(() => guard(context({ access, tenant: T }).ctx)),
			).toMatchObject({
				code: 'tenancy.errors.unknown-organization',
				status: 404,
			});
		}
	});
});

describe('membersReadPermissionWrites', () => {
	test('any member reads, the permission writes', async () => {
		const { reading, writing } = membersReadPermissionWrites('sales:manage');
		const { ctx } = context({
			access,
			tenant: T,
			held: { [T]: { [ACCOUNT_A]: 'member' } },
		});
		expect((await reading(ctx)).member).toBe('member');
		expect(await answerOf(() => writing(ctx))).toMatchObject({
			code: 'auth.errors.forbidden',
		});
		expect(requirePermission).toBeDefined();
	});
});

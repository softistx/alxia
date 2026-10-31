import { describe, expect, test } from 'bun:test';
import { defineModule } from '@alxia/modules';
import {
	ACCOUNT_A,
	accessFor,
	answerOf,
	context,
	type Role,
	roles,
	viewer,
} from '../test/harness';
import {
	can,
	requireAnyPermission,
	requireMember,
	requirePermission,
	requireSelf,
	requireViewer,
} from './guards';
import {
	membersReadPermissionWrites,
	permissionsReadWrite,
} from './scope-guards';

const sampleModule = defineModule({
	name: 'sample',
	permissions: ['sample:read', 'sample:manage'],
	defaultGrants: {
		sales: ['sample:read', 'sample:manage'],
		accountant: ['sample:read'],
		member: ['sample:read'],
	},
});
const members = defineModule({
	name: 'members',
	permissions: ['members:manage'],
});
const access = accessFor([sampleModule, members]);

const T = 'org-1';
const held = (role: Role) => ({ [T]: { [ACCOUNT_A]: role } });

describe('requirePermission, in its order', () => {
	test('401 with no viewer, before the scope is even looked at', async () => {
		const { ctx, reads } = context({ access, viewer: null });
		expect(
			await answerOf(() => requirePermission(ctx, 'sample:read')),
		).toMatchObject({ code: 'auth.errors.unauthenticated', status: 401 });
		expect(reads).not.toHaveBeenCalled();
	});

	test('the scope refuses a request that names no tenant', async () => {
		const { ctx } = context({ access });
		expect(
			await answerOf(() => requirePermission(ctx, 'sample:read')),
		).toMatchObject({
			code: 'tenancy.errors.organization-required',
			status: 400,
		});
	});

	test('the scope refuses a non-member the same way as an unknown tenant', async () => {
		const { ctx } = context({ access, tenant: T });
		expect(
			await answerOf(() => requirePermission(ctx, 'sample:read')),
		).toMatchObject({
			code: 'tenancy.errors.unknown-organization',
			status: 404,
		});
	});

	test('403 for a member whose role lacks the permission, params naming it', async () => {
		const { ctx } = context({ access, tenant: T, held: held('member') });
		expect(
			await answerOf(() => requirePermission(ctx, 'sample:manage')),
		).toMatchObject({
			code: 'auth.errors.forbidden',
			status: 403,
			params: { permission: 'sample:manage' },
		});
	});

	test('a member whose role holds it gets the scope', async () => {
		const { ctx } = context({ access, tenant: T, held: held('sales') });
		const scope = await requirePermission(ctx, 'sample:manage');
		expect(scope.member).toBe('sales');
		expect(scope.tenant.id).toBe(T);
	});

	test('every role is let in or refused by the matrix, through the guard', async () => {
		for (const role of roles) {
			const { ctx } = context({ access, tenant: T, held: held(role) });
			const refused = await answerOf(() =>
				requirePermission(ctx, 'members:manage'),
			);
			expect(refused?.code ?? null).toBe(
				role === 'admin' ? null : 'auth.errors.forbidden',
			);
		}
	});
});

describe('the request scope', () => {
	test('is resolved once per request, the membership read once', async () => {
		const { ctx, reads } = context({ access, tenant: T, held: held('sales') });
		await requirePermission(ctx, 'sample:read');
		await requirePermission(ctx, 'sample:manage');
		await can(ctx, 'sample:read');
		expect(reads).toHaveBeenCalledTimes(1);
	});

	test('is not resolved until a guard asks', () => {
		const { reads } = context({ access, tenant: T, held: held('sales') });
		expect(reads).not.toHaveBeenCalled();
	});
});

describe('can', () => {
	test('answers false for no viewer, and by the matrix for a member', async () => {
		expect(
			await can(
				context({ access, tenant: T, viewer: null }).ctx,
				'sample:read',
			),
		).toBe(false);
		const { ctx } = context({ access, tenant: T, held: held('accountant') });
		expect(await can(ctx, 'sample:read')).toBe(true);
		expect(await can(ctx, 'sample:manage')).toBe(false);
	});
});

describe('requireViewer', () => {
	test('returns the viewer or throws 401', () => {
		expect(requireViewer({ viewer: viewer() }).id).toBe(ACCOUNT_A);
		expect(() => requireViewer({ viewer: null })).toThrow();
	});
});

describe('requireMember', () => {
	test('lets any role in, and refuses in the guard order', async () => {
		const { ctx } = context({ access, tenant: T, held: held('member') });
		expect((await requireMember(ctx)).member).toBe('member');
		expect(
			await answerOf(() =>
				requireMember(context({ access, tenant: T, viewer: null }).ctx),
			),
		).toMatchObject({ code: 'auth.errors.unauthenticated', status: 401 });
		expect(
			await answerOf(() => requireMember(context({ access, tenant: T }).ctx)),
		).toMatchObject({
			code: 'tenancy.errors.unknown-organization',
			status: 404,
		});
	});
});

describe('requireAnyPermission', () => {
	test('a role holding only the second permission gets in', async () => {
		const { ctx } = context({ access, tenant: T, held: held('accountant') });
		expect(
			(await requireAnyPermission(ctx, ['sample:manage', 'sample:read']))
				.member,
		).toBe('accountant');
	});

	test('a role holding neither is 403, params naming the first', async () => {
		const { ctx } = context({ access, tenant: T, held: held('purchasing') });
		expect(
			await answerOf(() =>
				requireAnyPermission(ctx, ['sample:manage', 'sample:read']),
			),
		).toMatchObject({
			code: 'auth.errors.forbidden',
			status: 403,
			params: { permission: 'sample:manage' },
		});
	});
});

describe('requireSelf', () => {
	test('lets the account itself in, with no scope read', async () => {
		const { ctx, reads } = context({ access, tenant: T });
		expect((await requireSelf(ctx, ACCOUNT_A)).id).toBe(ACCOUNT_A);
		expect(reads).not.toHaveBeenCalled();
	});

	test('401 with no viewer, 403 for another account', async () => {
		expect(
			await answerOf(() =>
				requireSelf(context({ access, viewer: null }).ctx, ACCOUNT_A),
			),
		).toMatchObject({ code: 'auth.errors.unauthenticated', status: 401 });
		const { ctx } = context({ access, tenant: T, held: held('admin') });
		expect(
			await answerOf(() => requireSelf(ctx, 'b'.repeat(24))),
		).toMatchObject({
			code: 'auth.errors.forbidden',
			status: 403,
		});
	});

	test('with `or`, a holder of that permission is let in for another account', async () => {
		const other = 'b'.repeat(24);
		const admin = context({ access, tenant: T, held: held('admin') }).ctx;
		expect((await requireSelf(admin, other, { or: 'members:manage' })).id).toBe(
			ACCOUNT_A,
		);
		const member = context({ access, tenant: T, held: held('member') }).ctx;
		expect(
			await answerOf(() =>
				requireSelf(member, other, { or: 'members:manage' }),
			),
		).toMatchObject({
			code: 'auth.errors.forbidden',
			params: { permission: 'members:manage' },
		});
	});
});

describe('guards take a permission, not any string', () => {
	test('a string that is not <area>:read|manage does not compile', () => {
		const guard = (fn: () => unknown) => fn;
		const { ctx } = context({ access, tenant: T, held: held('sales') });
		guard(() => {
			// @ts-expect-error not a permission
			can(ctx, 'sample');
			// @ts-expect-error not a permission
			requirePermission(ctx, 'sample:write');
			// @ts-expect-error not a permission
			requireAnyPermission(ctx, ['sample:read', 'sample']);
			// @ts-expect-error not a permission
			requireSelf(ctx, ACCOUNT_A, { or: 'sample' });
			// @ts-expect-error not a permission
			permissionsReadWrite('sample', 'sample:manage');
			// @ts-expect-error not a permission
			membersReadPermissionWrites('sample');
		});
	});
});

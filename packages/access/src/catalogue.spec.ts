import { describe, expect, test } from 'bun:test';
import { defineModule, ModuleGraphError } from '@alxia/modules';
import { accessFor, roles } from '../test/harness';
import { createAccess } from './catalogue';
import { AccessCatalogueError } from './errors';

const sales = defineModule({
	name: 'sales',
	permissions: ['sales:read', 'sales:manage'],
	defaultGrants: {
		sales: ['sales:read', 'sales:manage'],
		member: ['sales:read'],
	},
});
const stock = defineModule({
	name: 'stock',
	permissions: ['stock:read', 'stock:manage'],
	defaultGrants: {
		warehouse: ['stock:read', 'stock:manage'],
		sales: ['stock:read'],
	},
});

const ledger = defineModule({
	name: 'ledger',
	permissions: ['sales:read', 'sales:manage'],
	defaultGrants: { viewer: ['sales:read'] },
});

describe('the catalogue, built from the modules', () => {
	const access = accessFor([sales, stock]);

	test('lists every declared permission, in registry order', () => {
		expect(access.permissions).toEqual([
			'sales:read',
			'sales:manage',
			'stock:read',
			'stock:manage',
		]);
	});

	test('the `all` role holds every permission', () => {
		expect(access.permissionsOf('admin')).toEqual(access.permissions);
	});

	test('a role holds what the modules grant it, in catalogue order, and nothing else', () => {
		expect(access.permissionsOf('sales')).toEqual([
			'sales:read',
			'sales:manage',
			'stock:read',
		]);
		expect(access.permissionsOf('warehouse')).toEqual([
			'stock:read',
			'stock:manage',
		]);
		expect(access.permissionsOf('member')).toEqual(['sales:read']);
		expect(access.permissionsOf('purchasing')).toEqual([]);
		expect(access.permissionsOf('accountant')).toEqual([]);
	});

	test('roleCan reads the matrix; no role holds nothing', () => {
		expect(access.roleCan('sales', 'sales:manage')).toBe(true);
		expect(access.roleCan('member', 'sales:manage')).toBe(false);
		expect(access.roleCan('member', 'unknown:read')).toBe(false);
		expect(access.roleCan(null, 'sales:read')).toBe(false);
		expect(access.permissionsOf(null)).toEqual([]);
	});

	test('every role has a row, and the matrix is frozen', () => {
		expect(Object.keys(access.matrix).sort()).toEqual([...roles].sort());
		expect(Object.isFrozen(access.matrix)).toBe(true);
		expect(Object.isFrozen(access.matrix.sales)).toBe(true);
	});

	test('a registry with no permission has an empty catalogue', () => {
		expect(accessFor([]).permissions).toEqual([]);
	});

	test('holds reads the role from the member by default, or from roleOf', async () => {
		expect(await access.holds('sales', { id: 'u' }, 'sales:manage')).toBe(true);
		expect(await access.holds('member', { id: 'u' }, 'sales:manage')).toBe(
			false,
		);
		const record = createAccess<string, { role: string } | undefined>(
			[ledger],
			{
				roles: ['owner', 'viewer'],
				all: 'owner',
				roleOf: (member, viewer) =>
					member?.role ?? (viewer.id === 'solo' ? 'owner' : null),
			},
		);
		expect(
			await record.holds({ role: 'owner' }, { id: 'u' }, 'sales:read'),
		).toBe(true);
		expect(await record.holds(undefined, { id: 'solo' }, 'sales:manage')).toBe(
			true,
		);
		expect(await record.holds(undefined, { id: 'u' }, 'sales:read')).toBe(
			false,
		);
	});
});

describe('a catalogue that cannot be built (boot errors)', () => {
	test('a permission declared by two modules', () => {
		const other = defineModule({ name: 'other', permissions: ['sales:read'] });
		expect(() => accessFor([sales, other])).toThrow(
			/"sales:read" is declared by two modules \("sales" and "other"\)/,
		);
		// The registry's error, with the registry's code.
		expect(() => accessFor([sales, other])).toThrow(ModuleGraphError);
	});

	test('every boot error has a namespaced code', () => {
		const other = defineModule({ name: 'other', permissions: ['sales:read'] });
		const code = (modules: Parameters<typeof accessFor>[0]) => {
			try {
				accessFor(modules);
			} catch (error) {
				return (error as { code: string }).code;
			}
			return undefined;
		};
		expect(
			code([defineModule({ name: 'bad', permissions: ['sales:write'] })]),
		).toBe('access.invalid-permission');
		expect(
			code([defineModule({ name: 'x', defaultGrants: { nobody: [] } })]),
		).toBe('access.unknown-role');
		expect(() =>
			createAccess([sales], { roles: ['owner'], all: 'ghost' as 'owner' }),
		).toThrow(expect.objectContaining({ code: 'access.unknown-role' }));
		expect(
			code([
				defineModule({
					name: 'x',
					defaultGrants: { member: ['sales:read'] },
				}),
			]),
		).toBe('access.undeclared-grant');
		expect(code([sales, other])).toBe('modules.duplicate-declaration');
	});

	test('a permission that is not <area>:read|manage', () => {
		for (const bad of [
			'sales',
			'Sales:read',
			'sales:',
			':read',
			'a:b:c',
			'a-b:read',
			'sales:write',
		]) {
			const module = defineModule({ name: 'bad', permissions: [bad] });
			expect(() => accessFor([module]), bad).toThrow(AccessCatalogueError);
		}
	});

	test('a grant to a role the host did not supply', () => {
		const module = defineModule({
			name: 'odd',
			permissions: ['odd:read'],
			defaultGrants: { hr: ['odd:read'] },
		});
		expect(() => accessFor([module])).toThrow(
			/module "odd" grants to "hr", which is not one of the host's roles/,
		);
	});

	test('a grant of a permission nobody declares (unknown permission)', () => {
		const module = defineModule({
			name: 'odd',
			permissions: ['odd:read'],
			defaultGrants: { member: ['odd:manage'] },
		});
		expect(() => accessFor([module])).toThrow(
			/module "odd" grants "odd:manage", which it does not declare/,
		);
	});

	test("a grant of another module's permission", () => {
		const module = defineModule({
			name: 'odd',
			permissions: ['odd:read'],
			defaultGrants: { sales: ['sales:read'] },
		});
		expect(() => accessFor([sales, module])).toThrow(/does not declare/);
	});

	test('the `all` role must be one of the roles', () => {
		expect(() => createAccess([], { roles: ['member'], all: 'admin' })).toThrow(
			/"admin" that holds every permission is not one of the roles/,
		);
	});
});

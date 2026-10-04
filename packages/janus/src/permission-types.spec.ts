import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext, type Empty } from '@alxia/core';
import { type Reads, reads, setup } from '../test/app';
import { byParam, permission } from './permission';

describe('permission: what its callbacks require', () => {
	test('unannotated callbacks read nothing more, and an app without what they read is refused', () => {
		const { access } = setup();
		const find = byParam('id', (id) => ({ id, doctorId: null }));
		const unannotated = permission(access, 'view', 'record', find, {
			subject: (ctx) => {
				expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
				return null;
			},
		});
		expectTypeOf(reads(unannotated)).toEqualTypeOf<Empty>();
		const byMember = permission(access, 'view', 'record', find, {
			subject: ({ member }: { member: { type: 'patient'; id: string } }) =>
				member,
		});
		const _refused = () => {
			// @ts-expect-error the plugin reads "member", which this app's context does not give
			alxia().use(byMember);
			alxia()
				.derive(() => ({ member: 1 }))
				// @ts-expect-error the plugin reads "member", which this app's context gives with another type
				.use(byMember);
			const wrong = permission(
				access,
				'view',
				'record',
				({ pathParams }: { pathParams: string }) => ({
					id: pathParams,
					doctorId: null,
				}),
			);
			// @ts-expect-error the plugin reads "pathParams", which this app's context gives with another type
			alxia().use(wrong);
		};
		expect(_refused).toBeFunction();
	});

	test('load, subject or ctx annotated any is refused on every app, by its name', () => {
		const { access } = setup();
		const find = byParam('id', (id) => ({ id, doctorId: null }));
		const byLoad = permission(access, 'view', 'record', (ctx: any) => ({
			id: String(ctx.id),
			doctorId: null,
		}));
		const bySubject = permission(access, 'view', 'record', find, {
			subject: (ctx: any) => ctx.member,
		});
		const byCtx = permission(access, 'edit', 'record', find, {
			ctx: (ctx: any) => ({ locked: Boolean(ctx.locked) }),
		});
		type Message<Callback extends string> = {
			readonly '~any': `the plugin's ${Callback} reads its context as any: annotate what it reads, or leave it unannotated`;
		};
		expectTypeOf<Reads<typeof byLoad>>().toEqualTypeOf<Message<'load'>>();
		expectTypeOf<Reads<typeof bySubject>>().toEqualTypeOf<Message<'subject'>>();
		expectTypeOf<Reads<typeof byCtx>>().toEqualTypeOf<Message<'ctx'>>();
		const _refused = () => {
			// @ts-expect-error the plugin's load reads its context as any
			alxia().use(byLoad);
			// @ts-expect-error the plugin's subject reads its context as any
			alxia().use(bySubject);
			alxia()
				.derive(() => ({ locked: false }))
				// @ts-expect-error the plugin's ctx reads its context as any, whatever the app gives
				.use(byCtx);
		};
		expect(_refused).toBeFunction();
	});

	test('the permission, the type, the object and the condition stay inferred as before', () => {
		const { access } = setup();
		type Rec = { id: string; doctorId: string | null; title: string };
		const find = byParam('id', (id): Rec | null => ({
			id,
			doctorId: null,
			title: id,
		}));
		alxia()
			.use(
				permission(access, 'view', 'record', (ctx) => {
					expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
					return { id: 'r1', doctorId: null, title: 'x' } as Rec | null;
				}),
			)
			.get('/', ({ object, reply }) => {
				expectTypeOf(object).toEqualTypeOf<Rec>();
				return reply(200, object.title);
			});
		permission(access, 'edit', 'record', find, {
			ctx: (ctx, object) => {
				expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
				expectTypeOf(object).toEqualTypeOf<Rec>();
				return { locked: false };
			},
		});
		const _refused = () => {
			// @ts-expect-error a permission with a condition needs ctx
			permission(access, 'edit', 'record', find);
			permission(access, 'edit', 'record', find, {
				// @ts-expect-error the condition reads { locked: boolean }
				ctx: () => ({ locked: 'no' }),
			});
			permission(access, 'view', 'record', find, {
				// @ts-expect-error a permission without a condition takes no ctx
				ctx: () => ({ locked: false }),
			});
			// @ts-expect-error not a permission of record
			permission(access, 'delete', 'record', find);
			const noDoctor = byParam('id', (id) => ({ id }));
			// @ts-expect-error the object carries no doctorId, which a fromField reads
			permission(access, 'view', 'record', noDoctor);
		};
		expect(_refused).toBeFunction();
	});

	test('an annotated subject on the loose path is required too', () => {
		const { access } = setup();
		const anyPermission = 'view' as 'view' | 'edit' | 'owners' | 'doctors';
		const loose = permission(
			access,
			anyPermission,
			'record',
			byParam('id', (id) => ({ id, doctorId: null })),
			{
				subject: ({ member }: { member: { type: 'patient'; id: string } }) =>
					member,
				ctx: () => 1, // only the loose path takes any ctx
			},
		);
		expectTypeOf(reads(loose)).toEqualTypeOf<{
			member: { type: 'patient'; id: string };
		}>();
		const _refused = () => {
			// @ts-expect-error the plugin reads "member", which this app's context does not give
			alxia().use(loose);
		};
		expect(_refused).toBeFunction();
	});
});

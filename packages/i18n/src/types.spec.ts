import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext, type Empty } from '@alxia/core';
import type { Path } from '@nxgt/i18n';
import { en, fr, i18n, reads } from '../test/catalogues';
import {
	type Catalogues,
	createI18n,
	type I18nContext,
	type KeyOf,
} from './i18n';

describe('KeyOf', () => {
	test("gives Path's keys, the shared catalogue's included", () => {
		expectTypeOf<KeyOf<typeof en>>().toEqualTypeOf<Path<typeof en> & string>();
		expectTypeOf<
			KeyOf<{ a: { b: 'x'; c: { d: 'y' } }; e: 'z' }>
		>().toEqualTypeOf<'a.b' | 'a.c.d' | 'e'>();
		// An empty section has no key, as in Path.
		expectTypeOf<
			KeyOf<{ a: Record<never, never>; b: 'x' }>
		>().toEqualTypeOf<'b'>();
	});

	test('reads nine levels exactly, and any key below', () => {
		type Deep = {
			l1: {
				l2: {
					l3: {
						l4: { l5: { l6: { l7: { l8: { l9: 'x'; m9: { l10: 'y' } } } } } };
					};
				};
			};
		};
		expectTypeOf<KeyOf<Deep>>().toEqualTypeOf<
			'l1.l2.l3.l4.l5.l6.l7.l8.l9' | `l1.l2.l3.l4.l5.l6.l7.l8.m9.${string}`
		>();
	});

	test('a function generic over its catalogues hands them to createI18n', () => {
		// Each was TS2589 with Path, whose recursion has no bound: the second
		// is what a route's context does to t when the app's context has an
		// index signature, as `RequiresOf<BaseContext>` has without Bun's types.
		const translatedWith = <
			const C extends Catalogues,
			const Fallback extends keyof C & string,
		>(
			resources: C,
			fallback: Fallback,
		) =>
			alxia()
				.use(createI18n({ resources, fallback }))
				.get('/', ({ language, reply }) => reply(200, language));
		const routed = <
			const C extends Catalogues,
			const Fallback extends keyof C & string,
		>(
			ctx: Readonly<Record<string, any>> & I18nContext<KeyOf<C[Fallback]>>,
		): Omit<typeof ctx, 'reply'> => ctx;
		expect(translatedWith({ en, fr }, 'fr')).toBeDefined();
		expect(routed).toBeFunction();
	});
});

describe("resolve reads the app's context", () => {
	interface User {
		readonly language: string | null;
	}
	const byUser = createI18n({
		resources: { en, fr },
		fallback: 'en',
		order: ['query'],
		resolve: ({ user }: BaseContext & { user: User | null }) =>
			user?.language ?? undefined,
	});
	/** Derives a user from `x-user-language`, or `null`. */
	const auth = alxia().derive(({ request }) => {
		const language = request.headers.get('x-user-language');
		const user: User | null = language === null ? null : { language };
		return { user };
	});

	test("an annotated resolve speaks the user's language, the languages and keys still inferred", async () => {
		expectTypeOf(reads(byUser)).toEqualTypeOf<{ user: User | null }>();
		expectTypeOf(byUser.supported).toEqualTypeOf<('en' | 'fr')[]>();
		const served = alxia()
			.plugin(auth)
			.use(byUser)
			.get('/', ({ language, t, reply }) => {
				expectTypeOf(language).toEqualTypeOf<'en' | 'fr'>();
				return reply(200, t('home.title'));
			});
		const title = async (headers: Record<string, string>, path = '/') =>
			(await served.request(path, { headers })).text();
		expect(await title({ 'x-user-language': 'fr' })).toBe('Bienvenue');
		expect(await title({})).toBe('Welcome');
		expect(await title({ 'x-user-language': 'fr' }, '/?lang=en')).toBe(
			'Welcome',
		);
	});

	test('an unannotated resolve, or none, requires nothing', () => {
		const plain = createI18n({
			resources: { en, fr },
			fallback: 'en',
			resolve: (ctx) => {
				expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
				return undefined;
			},
		});
		expectTypeOf(reads(plain)).toEqualTypeOf<Empty>();
		expectTypeOf(reads(i18n)).toEqualTypeOf<Empty>();
		alxia().use(plain).use(i18n);
	});

	test('an app that does not give what resolve reads is refused, and so is any', () => {
		const loose = createI18n({
			resources: { en, fr },
			fallback: 'en',
			resolve: (ctx: any) => ctx.user.language,
		});
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(byUser);
			alxia()
				.derive(() => ({ user: { language: 1 } }))
				// @ts-expect-error the plugin reads "user", which this app's context gives with another type
				.use(byUser);
			// @ts-expect-error the plugin's resolve reads its context as any
			alxia().plugin(auth).use(loose);
		};
		expect(_refused).toBeFunction();
	});
});

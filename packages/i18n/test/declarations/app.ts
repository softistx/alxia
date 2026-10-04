// An app behind translations, behind exported functions whose return types
// are inferred: a declaration build must be able to name each one through
// `@alxia/i18n`, `@alxia/language`, `@alxia/core` and `@nxgt/i18n` alone
// (TS2883 otherwise).
import { alxia, type BaseContext } from '@alxia/core';
import { type Catalogues, createI18n } from '@alxia/i18n';

const en = { home: { title: 'Home', greeting: 'Hello {name}' } } as const;
const fr = { home: { title: 'Accueil', greeting: 'Bonjour {name}' } } as const;

const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

export function translated() {
	return alxia()
		.plugin(i18n)
		.get('/', ({ t, language, reply }) =>
			reply(200, { title: t('home.title'), language }),
		);
}

export function translatedFor() {
	return alxia()
		.derive(() => ({ user: { language: 'fr' } }))
		.plugin(
			createI18n({
				resources: { en, fr },
				fallback: 'fr',
				resolve: (ctx: BaseContext & { user: { language: string } }) =>
					ctx.user.language,
			}),
		)
		.get('/', ({ t, reply }) =>
			reply(200, t('home.greeting', { name: 'Ada' })),
		);
}

// Generic over the catalogues: `t`'s keys stay a type over `C`, which the
// declaration names through `KeyOf`.
export function translatedWith<
	const C extends Catalogues,
	const Fallback extends keyof C & string,
>(resources: C, fallback: Fallback) {
	return alxia()
		.plugin(createI18n({ resources, fallback }))
		.get('/', ({ language, reply }) => reply(200, language));
}

export function translator() {
	return i18n;
}

// An app behind the language plugin, behind exported functions whose return
// types are inferred: a declaration build must be able to name each one
// through `@alxia/language` and `@alxia/core` alone (TS2883 otherwise).
import { alxia, type BaseContext } from '@alxia/core';
import { language } from '@alxia/language';

export function speaking() {
	return alxia()
		.use(
			language({
				supported: ['en', 'fr'],
				fallback: 'en',
				order: ['path', 'query', 'cookie', 'header'],
				persist: { maxAge: 3600 },
			}),
		)
		.get('/', ({ language: lang, languageSource, reply }) =>
			reply(200, { lang, languageSource }),
		);
}

export function speakingTo() {
	return alxia()
		.derive(() => ({ user: { language: 'fr' } }))
		.use(
			language({
				supported: ['en', 'fr', 'de'],
				fallback: 'en',
				resolve: (ctx: BaseContext & { user: { language: string } }) =>
					ctx.user.language,
				vary: ['authorization'],
			}),
		)
		.get('/', ({ language: lang, reply }) => reply(200, lang));
}

export function speakingAny<const L extends string>(
	supported: readonly L[],
	fallback: L,
) {
	return alxia()
		.use(language({ supported, fallback }))
		.get('/', ({ language: lang, reply }) => reply(200, lang));
}

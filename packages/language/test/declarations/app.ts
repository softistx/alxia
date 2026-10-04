// An app behind the language plugin, behind exported functions whose return
// types are inferred: a declaration build must be able to name each one
// through `@alxia/language` and `@alxia/core` alone (TS2883 otherwise).
import { alxia, type BaseContext } from '@alxia/core';
import { language } from '@alxia/language';

export function speaking() {
	return alxia()
		.plugin(
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
		.plugin(
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
		.plugin(language({ supported, fallback }))
		.get('/', ({ language: lang, reply }) => reply(200, lang));
}

// With Bun's types, the plugin requires nothing of the app: a route reads
// only what the context gives. Without them, `Bun.Server` is an error type
// and the requirement widens to `{ [x: string]: any }`, which any key reads.
export function speakingOnly() {
	return alxia()
		.plugin(language({ supported: ['en'], fallback: 'en' }))
		.get('/', (ctx) => {
			// @ts-expect-error not in the context
			ctx.nothing;
			return ctx.reply(200, ctx.language);
		});
}

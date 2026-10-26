// The /document exports behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/document` alone (TS2883 otherwise).

import {
	CspNonceMeta,
	createPageLanguage,
	DocumentNonce,
	type DocumentNonceProps,
	InlineScript,
	type InlineScriptProps,
	type PageLanguage,
	type PageLanguageOptions,
	textDirection,
	useNonce,
} from '@alxia/react-router/document';

export const root = {
	Nonce: DocumentNonce,
	Script: InlineScript,
	Meta: CspNonceMeta,
	use: useNonce,
	boot: (props: InlineScriptProps): InlineScriptProps => props,
	provide: (props: DocumentNonceProps): DocumentNonceProps => props,
	element: () =>
		InlineScript({ code: 'document.documentElement.dataset.booted = "1"' }),
};

export const language = createPageLanguage({
	languages: ['en', 'fr', 'ar'],
	fallback: 'en',
});

export const direction = {
	of: (tag: string): 'ltr' | 'rtl' => textDirection(tag),
	options: (
		options: PageLanguageOptions<'en' | 'fr'>,
	): PageLanguageOptions<'en' | 'fr'> => options,
	instance: (instance: PageLanguage<'en' | 'fr'>): PageLanguage<'en' | 'fr'> =>
		instance,
};

// The fallback is typed: one outside `languages` is refused.
createPageLanguage({
	languages: ['en', 'fr'],
	// @ts-expect-error 'de' is not 'en' | 'fr'
	fallback: 'de',
});

// A picked language is typed too.
// @ts-expect-error 'de' is not 'en' | 'ar' | 'fr'
language.chooseLanguage('de');

// useNonce() is `string | undefined`: under exactOptionalPropertyTypes the
// props and options must accept `undefined` themselves.
export const forwarded = (): InlineScriptProps => ({
	code: 'a()',
	nonce: useNonce(),
});
export const forwardedNonce = (): DocumentNonceProps => ({
	nonce: useNonce(),
	children: undefined,
});
export const forwardedScript = () =>
	InlineScript({ code: 'a()', nonce: useNonce() });

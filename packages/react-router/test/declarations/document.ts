// The /document exports behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/document` alone (TS2883 otherwise).

import {
	CspNonceMeta,
	DocumentNonce,
	type DocumentNonceProps,
	InlineScript,
	type InlineScriptProps,
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

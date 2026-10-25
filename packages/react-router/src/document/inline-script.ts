import { createElement, type ReactElement } from 'react';
import { useNonce } from './nonce';

export interface InlineScriptProps {
	/** The script's text, rendered as it is: never escaped. */
	code: string;
	/** The script's nonce; `useNonce()`'s by default. */
	nonce?: string;
}

/**
 * An inline `<script>` carrying the page's CSP nonce, on the server and in
 * the browser, so hydration finds the attribute it rendered. The code is a
 * constant of the app (a theme's boot script): never put user input in it.
 * With no nonce anywhere, it renders no `nonce` attribute, and the policy
 * must then allow inline scripts some other way.
 */
export function InlineScript({ code, nonce }: InlineScriptProps): ReactElement {
	const fromDocument = useNonce();
	return createElement('script', {
		nonce: nonce ?? fromDocument,
		dangerouslySetInnerHTML: { __html: code },
	});
}

/**
 * `<meta property="csp-nonce" nonce="…">`: the page's nonce for the scripts
 * and styles a library adds at runtime (a UI kit reads it from the DOM).
 */
export function CspNonceMeta(): ReactElement {
	return createElement('meta', {
		property: 'csp-nonce',
		nonce: useNonce(),
	});
}

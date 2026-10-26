import { createElement, type ReactElement } from 'react';
import { useNonce } from './nonce';

const BREAKS_OUT = /<\/script|<!--/i;

export interface InlineScriptProps {
	/**
	 * The script's text, rendered as it is: never escaped, so a `</script`
	 * or a `<!--` in it is refused (see `InlineScript`).
	 */
	code: string;
	/** The script's nonce; `useNonce()`'s by default. */
	nonce?: string | undefined;
}

/**
 * An inline `<script>` carrying the page's CSP nonce, on the server and in
 * the browser, so hydration finds the attribute it rendered. The code is a
 * constant of the app (a theme's boot script): never put user input in it.
 * With no nonce anywhere, it renders no `nonce` attribute, and the policy
 * must then allow inline scripts some other way.
 *
 * Throws a `TypeError` when the code holds `</script` or `<!--`, which end or
 * confuse the element whatever the nonce: escape them in a string (`<\/script`).
 */
export function InlineScript({ code, nonce }: InlineScriptProps): ReactElement {
	if (BREAKS_OUT.test(code)) {
		throw new TypeError(
			'InlineScript(): the code contains "</script" or "<!--", which ends or confuses the script element; escape it, such as "<\\/script" inside a string',
		);
	}
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

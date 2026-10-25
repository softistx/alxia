import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
} from 'react';

const NonceContext = createContext<string | undefined>(undefined);

export interface DocumentNonceProps {
	/** This response's CSP nonce: `nonceOf(loadContext)` in the entry. */
	nonce: string | undefined;
	children?: ReactNode;
}

/**
 * Gives the server render this response's CSP nonce, for `useNonce()` and
 * the components built on it. The entry wraps the router in it, so every
 * boundary reads the nonce, an error page after an action included (it
 * runs no loader). Never put the nonce in loader data: the browser hides
 * it from the page, and loader data would print it in the hydration script
 * and every `.data` answer.
 */
export function DocumentNonce({
	nonce,
	children,
}: DocumentNonceProps): ReactNode {
	return createElement(NonceContext, { value: nonce }, children);
}

let documentNonce: string | undefined;

/**
 * The page's CSP nonce, for what the root renders: an inline script, and
 * React Router's `<Links>`, `<Scripts>` and `<ScrollRestoration>`. On the
 * server, the one `DocumentNonce` provides. In the browser, the one the
 * document's scripts carry: React Router's client knows no nonce, and
 * React would find `nonce` on the server's elements and none in its own (a
 * hydration mismatch). It is read from the first `script[nonce]`'s DOM
 * property (the browser hides the attribute, not the property), once for
 * the document. That first read is cached per module copy, so a test with a
 * DOM keeps it across tests: reset modules, or render the server path with
 * `DocumentNonce`.
 */
export function useNonce(): string | undefined {
	const serverNonce = useContext(NonceContext);
	if (typeof document === 'undefined') return serverNonce;
	documentNonce ??=
		document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
	return documentNonce || undefined;
}

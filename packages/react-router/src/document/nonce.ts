import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
} from 'react';

/**
 * One context per process, whichever copy of this module asks: a package
 * loaded natively that imports `/document` would otherwise get a second
 * context, and its `useNonce()` would never see the entry's `DocumentNonce`.
 * `/document` imports `react` alone, so the few lines of `src/context.ts`'s
 * singleton are written here. The `@1` suffix is the shape of what is stored
 * under the key: a version that changes it bumps the suffix, never the name.
 */
const KEY = Symbol.for('@alxia/react-router:document-nonce@1');
const registry = globalThis as Record<symbol, unknown>;
registry[KEY] ??= createContext<string | undefined>(undefined);
const NonceContext = registry[KEY] as ReturnType<
	typeof createContext<string | undefined>
>;

export interface DocumentNonceProps {
	/** This response's CSP nonce: `nonceOf(loadContext)` in the entry. */
	nonce: string | undefined;
	children?: ReactNode | undefined;
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

const HEAD_NONCE = 'head script[nonce], head meta[property="csp-nonce"]';

let documentNonce: string | undefined;

/**
 * The page's CSP nonce, for what the root renders: an inline script, and
 * React Router's `<Links>`, `<Scripts>` and `<ScrollRestoration>`. On the
 * server, the one `DocumentNonce` provides. In the browser, the one the
 * document carries: React Router's client knows no nonce, and React would
 * find `nonce` on the server's elements and none in its own (a hydration
 * mismatch). It is read from the DOM property of the first script or
 * `csp-nonce` meta in the `<head>` (the browser hides the attribute, not
 * the property), else of the first `script[nonce]` anywhere, once for the
 * document. That first read is cached per module copy, so a test with a
 * DOM keeps it across tests: reset modules, or render the server path with
 * `DocumentNonce`.
 *
 * "In the browser" means a global `document`. A server that installs a DOM
 * shim on `globalThis` takes the browser path and finds no nonce: it must not
 * render this hook that way.
 */
export function useNonce(): string | undefined {
	const serverNonce = useContext(NonceContext);
	if (typeof document === 'undefined') return serverNonce;
	documentNonce ??=
		(
			document.querySelector<HTMLElement>(HEAD_NONCE) ??
			document.querySelector<HTMLElement>('script[nonce]')
		)?.nonce ?? '';
	return documentNonce || undefined;
}

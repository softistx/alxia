/**
 * `@alxia/react-router/document`: what a root route renders for the page's
 * CSP nonce, on the server and in the browser. `react` is its only import
 * (an optional peer of the package), and nothing runs at the top level but
 * `createContext`.
 */
export {
	CspNonceMeta,
	InlineScript,
	type InlineScriptProps,
} from './inline-script';
export {
	DocumentNonce,
	type DocumentNonceProps,
	useNonce,
} from './nonce';
export {
	createPageLanguage,
	type PageLanguage,
	type PageLanguageOptions,
} from './page-language';
export { textDirection } from './text-direction';

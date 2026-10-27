/**
 * `@alxia/react-router/session/react`: the hooks of a page around the
 * session flows `/session` serves: signing out, a mail link's parameter and
 * a one-code field. `react` and `react-router` are its only imports; it
 * shares nothing with the server side of `/session`.
 */
export {
	type CodeField,
	type CodeSchema,
	useCodeField,
	useOnRefusal,
} from './use-code-field';
export { type LinkParamOptions, useLinkParam } from './use-link-param';
export {
	SIGN_OUT_PATH,
	type SignOutOptions,
	signOutAfter,
	useSignOut,
} from './use-sign-out';

/**
 * `@alxia/react-router/session/react`: the hooks of a page around the
 * session flows `/session` serves: signing out, a mail link's parameter,
 * a one-code field and the step-up with the replay of the refused action. `react` and `react-router` are its only imports; it
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
export {
	asksStepUp,
	type StepUpChannel,
	type StepUpDialogPhase,
	type StepUpDialogProps,
	type StepUpOptions,
	type StepUpReplayOptions,
	stepUpDialogPhase,
	useStepUp,
	useStepUpReplay,
} from './use-step-up';

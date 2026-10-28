/**
 * `@alxia/react-router/session`: the session of a BFF, the app that renders
 * pages over a GraphQL API and keeps the API's session token in its own
 * cookie. The subpath may import `react-router` and `/errors`' files,
 * nothing else.
 */
export { CHALLENGE_OVER, INVALID_CODE, MAIL_THROTTLED } from './codes';
export {
	type ChallengeCookies,
	type CookieSession,
	type NoChallengeCookies,
	type SessionCookies,
	type SessionCookiesBase,
	type SessionCookiesOptions,
	type SessionCookiesWithoutChallengeOptions,
	sessionCookies,
} from './cookies';
export type {
	SecondFactorSteps,
	SignInAnswer,
	SignInCodes,
	SignInFlow,
	SignInFlowBase,
	SignInFlowOptions,
	SignInFlowWithoutSecondFactorOptions,
	SignInFormError,
	SignInStayed,
} from './flow-types';
export { TOKEN_PAGE_HEADERS } from './link-token';
export type {
	AuthLinks,
	AuthLinksCodes,
	AuthLinksOptions,
	LinkStayed,
	RequestLinkAnswer,
	SpendOptions,
	Spent,
} from './link-types';
export { authLinks } from './links';
export {
	readCookie,
	type SerializeOptions,
	secondsUntil,
	serializeCookie,
} from './serialize';
export { signInFlow } from './sign-in';
export { stepUpSteps } from './step-up';
export { STEP_UP_OVER, STEP_UP_REQUIRED } from './step-up-codes';
export type {
	StepUpCall,
	StepUpCodes,
	StepUpStayed,
	StepUpSteps,
	StepUpStepsOptions,
} from './step-up-types';

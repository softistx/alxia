import type { data } from 'react-router';
import type { ApiErrorLike } from '../errors/api-error';
import type { ApiErrors } from '../errors/api-errors';
import type { JsonActions } from '../errors/json-actions';
import type { SessionCookies } from './cookies';
import type { SecondFactorMethod, SignInPaths, SignInStatus } from './model';

/**
 * What a sign-in step answers, in `@nxgt/janus`'s words. An app maps its
 * API's enums to it, once: `SIGNED_IN` to `signedIn`, `SECOND_FACTOR` to
 * `secondFactor`, and anything else (such as a `LINKED`) to `other`.
 */
export type SignInAnswer =
	| {
			readonly status: 'signedIn';
			readonly token: string;
			readonly expiresAt: string | Date;
	  }
	| {
			readonly status: 'secondFactor';
			/** A secret: it goes in the challenge cookie, never in a URL. */
			readonly challenge: string;
			readonly expiresAt?: string | Date | null;
	  }
	| { readonly status: 'other' };

/** What a sign-in form's action answers when it stays on the page. */
export type SignInFormError<T = object> = T & { formError: string };

/** The codes the flow tells apart; `@nxgt/janus`'s by default. */
export interface SignInCodes {
	/** A wrong code that may leave tries (`'CODE_INVALID'`). */
	readonly invalidCode?: string;
	/** The codes that end the challenge (`TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`). */
	readonly challengeOver?: readonly string[];
}

export interface SignInFlowOptions<L extends string> {
	readonly cookies: SessionCookies;
	/** The app's `createApiErrors` instance. */
	readonly errors: ApiErrors<L>;
	/** The app's `jsonActions({ origin })`, so a body is read with the same CSRF check. */
	readonly json: JsonActions;
	/** Ends a session at the API (the app's sign-out mutation); a failure is ignored. */
	revoke(token: string, request: Request): Promise<unknown>;
	/** A refused code's tries left, worded ("3 tries left"). */
	attemptsLeft(count: number, language: L): string;
	/** The sign-in pages' paths; `SIGN_IN_PATHS` by default. */
	readonly paths?: Partial<SignInPaths>;
	/**
	 * `Set-Cookie` values a new session and a sign-out also clear, such as an
	 * app's per-account preferences.
	 */
	clear?(): readonly string[];
	/** What a sign-in says when the API cannot be reached; `errors.unavailableMessage` by default. */
	unavailable?(language: L): string;
	readonly codes?: SignInCodes;
	/**
	 * The query key a sign-in redirect adds (as `?expired=1`) when the request
	 * carried a session cookie, to say the session ended. Off by default.
	 */
	readonly endedParam?: string;
}

/** A form step's answer when it stays on the page: the form's message, with a status. */
export type SignInStayed<T extends object> = ReturnType<
	typeof data<SignInFormError<T>>
>;

export interface SignInFlow<L extends string> {
	/** The `next` a sign-in page was opened with, safe to redirect to. */
	nextParam(request: Request): string;
	/** The sign-in page, coming back to this request's page, with the session cookie cleared. */
	signInRedirect(request: Request): Response;
	/**
	 * Where an answer leads: signed in, to `next` with the session cookie and
	 * the challenge cleared; a second factor, to its page with the challenge
	 * in its cookie. `null` for any other answer.
	 */
	landing(answer: SignInAnswer, next: string): Response | null;
	/**
	 * `landing`, ending the session the browser held first, when the answer's
	 * status is in `revokeOn` (a new session only, by default).
	 */
	landReplacing(
		answer: SignInAnswer,
		next: string,
		options: {
			readonly request: Request;
			readonly revokeOn?: readonly SignInStatus[];
		},
	): Promise<Response | null>;
	/**
	 * Runs a sign-in step and redirects where its answer leads. An API
	 * refusal is the form's message with its status; an API it cannot reach
	 * says `unavailable` with a 503.
	 */
	signInStep<T extends object>(
		run: () => Promise<SignInAnswer>,
		options: {
			readonly request: Request;
			readonly language: L;
			readonly next: string;
			/** Fields every refusal carries. */
			readonly extra: T;
			/** Answers an error before the default message: a redirect, a richer message. */
			readonly refused?: (error: ApiErrorLike) => Response | string | undefined;
		},
	): Promise<Response | SignInStayed<T>>;
	/**
	 * A refused code's message with the tries left; `undefined` when the
	 * challenge is over (sign in again). With no try left, `whenNone` is
	 * added to the message instead, when given.
	 */
	codeRefusal(
		error: ApiErrorLike,
		language: L,
		whenNone?: string,
	): string | undefined;
	/** The code a second-factor page posted, with how it is given; a 400 otherwise. */
	readCodeInput(
		request: Request,
	): Promise<{ kind: SecondFactorMethod; code: string }>;
	/** The code against the challenge: `confirm` for an issued code, `recover` for a recovery code. */
	codeStep(
		input: { readonly kind: SecondFactorMethod; readonly code: string },
		challenge: string,
		steps: {
			confirm(challenge: string, code: string): Promise<SignInAnswer>;
			recover(challenge: string, code: string): Promise<SignInAnswer>;
		},
	): Promise<SignInAnswer>;
	/** Ends the request's session at the API; true when it carried one. */
	revokeSession(request: Request): Promise<boolean>;
	/**
	 * Revokes the session, clears its cookies and redirects (to the sign-in
	 * page with `?signed-out=1` by default; `to` goes through `safeNext`). It
	 * reads the body as JSON first, so another site cannot sign anyone out.
	 */
	signOut(
		request: Request,
		options?: { readonly to?: string },
	): Promise<Response>;
	/**
	 * The viewer `read` finds for the session cookie's token (or `token`):
	 * `null` when the API refuses it with a 401, `undefined` without a cookie
	 * or when the API cannot tell.
	 */
	viewer<V>(
		request: Request,
		read: (token: string) => Promise<V | null>,
		token?: string,
	): Promise<V | null | undefined>;
	/**
	 * The signed-in viewer, else the sign-in redirect (thrown): no cookie, a
	 * 401, or no viewer. Any other failure is thrown through `routeError`.
	 * `headers` set the cookie again when the API moved the session's end.
	 */
	requireViewer<V>(
		request: Request,
		read: (token: string) => Promise<V | null>,
		expiresAt: (viewer: V) => string | null,
	): Promise<{ viewer: V; headers: HeadersInit }>;
}

/** The options once resolved, as the flow's functions take them. */
export interface FlowContext<L extends string> {
	readonly options: SignInFlowOptions<L>;
	readonly paths: SignInPaths;
	readonly invalidCode: string;
	readonly challengeOver: readonly string[];
}

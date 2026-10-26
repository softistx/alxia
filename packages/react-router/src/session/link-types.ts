import type { data } from 'react-router';
import type { ApiErrorLike } from '../errors/api-error';
import type { FormErrors } from '../errors/form-errors';
import type { InferOutput, StandardSchemaV1 } from '../errors/standard-schema';
import type { SignInAnswer, SignInFlow } from './flow-types';

export interface AuthLinksOptions<L extends string> {
	/**
	 * The app's sign-in flow: it lands the sessions a link opens, and its
	 * `cookies`, `errors` and `json` are the ones the links use.
	 */
	readonly signIn: SignInFlow<L>;
	/** The codes the links tell apart; `@nxgt/janus`'s by default. */
	readonly codes?: {
		/** The API's wait on mailed links; `MAIL_THROTTLED` by default. */
		readonly mailThrottled?: string | undefined;
	};
	/**
	 * The wait of a throttled mail in the app's words, before `errors`'
	 * default; `undefined` keeps the default.
	 */
	wording?(error: ApiErrorLike, language: L): string | undefined;
	/**
	 * Where a new session starts, from its token (the viewer's own page): read
	 * after the token is spent, so the sign-in lands there at once instead of
	 * on `/`, whose redirect would push a history entry after the token's.
	 * `/` when it is missing, throws or answers an unsafe path.
	 */
	start?(token: string, request: Request): Promise<string>;
	/** Where a password reset leads; `/sign-in?password-reset=1` by default. */
	readonly resetDone?: string;
	/** The state a token the API refuses ends on; `'invalid'` by default. */
	readonly invalidState?: string;
}

/** The options with what they read of the flow: the functions take this. */
export type LinksContext<L extends string> = AuthLinksOptions<L> &
	Pick<SignInFlow<L>, 'cookies' | 'errors' | 'json'>;

/** What a token page answers when it stays on the page. */
export type LinkStayed = ReturnType<typeof data<FormErrors>>;

/** A link request's answer: always "sent", whoever the e-mail is. */
export type RequestLinkAnswer = {
	sent?: true;
	formError?: string;
	/** A throttled request: the seconds to wait (a whole number from 0), when the API says. */
	retryAfter?: number;
	/** The address refused as malformed: under the field. */
	fieldErrors?: { email?: string };
};

export type Spent<T> =
	| { readonly ok: true; readonly value: T }
	/** An end state of the page: the token no longer works. */
	| { readonly ok: false; readonly response: Response }
	/** The page stays, with the form's refusal. */
	| {
			readonly ok: false;
			readonly refusal: FormErrors;
			readonly status: number;
	  };

export interface SpendOptions<L extends string> {
	/** The post: a same-site JSON one goes on, as for every step that spends. */
	readonly request: Request;
	readonly language: L;
	/** The page's path, without its token. */
	readonly path: string;
	/** The API codes that end the page, and the state each one shows. */
	readonly states: Readonly<Partial<Record<string, string>>>;
	/** The fields the page shows a refusal under; any other is the form's message. */
	readonly fields?: readonly string[];
}

export interface AuthLinks<L extends string> {
	/** The token page in an end state, without its token: `path?state=…`. */
	statePath(path: string, state: string): string;
	/** A redirect to a token page's end state, replacing the token's history entry. */
	ended(path: string, state: string, headers?: HeadersInit): Response;
	/**
	 * The arguments a token page posted, read as JSON (`json.readJson`: a
	 * cross-site post is a 403, before anything is spent) and checked against
	 * a Standard Schema. A token the schema refuses ends on the invalid state
	 * (thrown); any other refusal is a 400.
	 */
	linkArgs<S extends StandardSchemaV1>(
		schema: S,
		request: Request,
		path: string,
	): Promise<InferOutput<S>>;
	/** Posts a link's token with `run`: its value, else what the page answers. A post that is not a same-site JSON one is refused first. */
	spendToken<T>(
		run: () => Promise<T>,
		options: SpendOptions<L>,
	): Promise<Spent<T>>;
	/** What an action answers for a refused `Spent`. */
	answerOf(spent: Exclude<Spent<unknown>, { ok: true }>): Response | LinkStayed;
	/**
	 * Where a link's sign-in leads, replacing the token's history entry. The
	 * session the browser held is revoked first; an answer that leads nowhere
	 * is the form's "unavailable"; `other` is too, unless `other` names the
	 * state to end on (an app's own `LINKED`: no session opened, the
	 * browser's kept). A form post that is not JSON is refused first.
	 */
	landByLink(
		answer: SignInAnswer,
		options: {
			readonly request: Request;
			readonly language: L;
			/** Where an `other` answer ends instead of failing: a token page and its state. */
			readonly other?: { readonly path: string; readonly state: string };
		},
	): Promise<Response | LinkStayed>;
	/** After a password reset: the browser's session revoked and cleared, then the sign-in page. */
	afterReset(request: Request): Promise<Response>;
	/** Requests a mail's link with `run`; only a same-site JSON post goes on. */
	requestLink(
		run: () => Promise<unknown>,
		options: { readonly request: Request; readonly language: L },
	): Promise<ReturnType<typeof data<RequestLinkAnswer>>>;
}

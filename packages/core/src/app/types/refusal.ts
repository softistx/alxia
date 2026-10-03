/**
 * How an app's type carries its `onRefusal` hook: what the hook may
 * declare, and the marked replies that take the place of the default 400
 * in the type of each route after it that validates, and of the default
 * 413 in the type of each route under a `bodyLimit`.
 */
import type {
	ContentTooLargeBody,
	RefusalKind,
	ValidationErrorBody,
} from '../../errors/errors';
import type { Reply } from '../../reply/reply';
import type {
	InferOutput,
	StandardSchemaV1,
} from '../../schema/standard-schema';
import type { Jsonify } from '../../types/json';
import type { ClientErrorStatus } from '../../types/status';
import type { Outcome, OutcomeOf } from './route-table';

/** The schema of each status an `onRefusal` hook may answer, client errors only. */
export type RefusalResponses = {
	readonly [Status in ClientErrorStatus]?: StandardSchemaV1;
};

/**
 * What an `onRefusal` hook declares: the schema of each status it may
 * answer — its reply is checked by it, typed and documented — and the
 * `content-type` its reply is sent with unless it sets one.
 */
export interface RefusalSchema<
	Responses extends RefusalResponses = RefusalResponses,
> {
	readonly response: Responses;
	readonly contentType?: string;
}

/** The replies an `onRefusal` hook answers with, marked; the default 400 when it may return nothing. */
export type RefusalsOf<Replies, Result> =
	| (Replies & Refusing)
	| (undefined extends Result
			? Reply<400, ValidationErrorBody> & FallsBack
			: never);

/** Every reply a hook declaring `Responses` may answer, as its schemas give it back. */
export type DeclaredRefusal<Responses> = {
	[Status in keyof Responses & ClientErrorStatus]: Reply<
		Status,
		Responses[Status] extends StandardSchemaV1
			? InferOutput<Responses[Status]>
			: never
	>;
}[keyof Responses & ClientErrorStatus];

/**
 * `Kind`, when it is one kind: a union of kinds is `never`, since the
 * hook is registered for the one string it is given at runtime.
 */
export type OneKind<Kind extends RefusalKind> =
	true extends IsUnion<Kind> ? never : Kind;

type IsUnion<T, All = T> = T extends unknown
	? [All] extends [T]
		? false
		: true
	: never;

/**
 * The replies an `onRefusal(kind, hook)` hook answers with, marked by its
 * kind; when it may return nothing, the mark that the general hook, then
 * the default, answers that kind then.
 */
export type KindRefusalsOf<Kind extends RefusalKind, Replies, Result> =
	| (Replies & RefusingKind<Kind>)
	| (undefined extends Result
			? Reply<400, ValidationErrorBody> & KindFallsBack<Kind>
			: never);

/**
 * The mark, among an app's shortcuts, of each reply its `onRefusal` hook
 * answers a refused request with: they replace the default 400 of a route
 * that validates, and are no part of a route that does not. The replies of
 * a hook of one kind carry `RefusingKind` too.
 */
export interface Refusing {
	readonly '~refusal': true;
}

/**
 * The mark of each reply an `onRefusal(kind, hook)` hook answers with: it
 * replaces the default of that kind alone, and the general hook's for it.
 */
export interface RefusingKind<Kind extends RefusalKind> extends Refusing {
	readonly '~kind': Kind;
}

/**
 * The mark of a hook of one kind that may return nothing: the general
 * hook in force answers that kind then, or, without one, the default.
 */
export interface KindFallsBack<Kind extends RefusalKind>
	extends RefusingKind<Kind> {
	readonly '~fallback': true;
}

/**
 * The default 400 in a route's type, marked: the `onRefusal` hook of an
 * app a plugin is used by replaces it on the plugin's routes, as it does
 * at runtime. The client reads it as `Outcome<400, ValidationErrorBody>`.
 */
export interface DefaultRefusalOutcome
	extends Outcome<400, ValidationErrorBody> {
	readonly '~default': true;
}

/**
 * The mark of the default 400 among a hook's refusals: the hook may return
 * nothing, and the default answers then.
 */
export interface FallsBack extends Refusing {
	readonly '~fallback': true;
}

/**
 * The default 413 in a route's type, marked as the default 400 is: the
 * `onRefusal` hook of an app a plugin is used by replaces it.
 */
export interface DefaultLimitOutcome
	extends Outcome<413, Jsonify<ContentTooLargeBody>> {
	readonly '~default': true;
}

/**
 * The mark, among an app's shortcuts, of a `bodyLimit()` in force: every
 * route after it may refuse its body with a `body_limit` refusal.
 */
export interface BodyLimited {
	readonly '~bodyLimit': true;
}

/** What `bodyLimit()` adds to the shortcuts of the routes after it. */
export type BodyLimitShortcut = Reply<413, ContentTooLargeBody> & BodyLimited;

/** Whether a route is under a `bodyLimit`: its own, or one in force before it. */
export type IsLimited<Schema, Shortcuts> = Schema extends {
	readonly bodyLimit: number;
}
	? true
	: [Extract<Shortcuts, BodyLimited>] extends [never]
		? false
		: true;

/** The replies of the general hook, `onRefusal(hook)`, among `Shortcuts`. */
type GeneralRefusals<Shortcuts> = Exclude<
	Extract<Shortcuts, Refusing>,
	RefusingKind<RefusalKind>
>;

/** The default of a kind, marked: a using app's hooks replace it. */
type MarkedDefault<Kind extends RefusalKind> = Kind extends 'validation'
	? DefaultRefusalOutcome
	: DefaultLimitOutcome;

/** The default of a kind a hook falls back to: the hook in force is the route's own, so nothing replaces it. */
type PlainDefault<Kind extends RefusalKind> = Kind extends 'validation'
	? Outcome<400, ValidationErrorBody>
	: Outcome<413, Jsonify<ContentTooLargeBody>>;

/** The outcomes of the marked replies of a hook, and `Fallback` when it may return nothing. */
type Answered<Marked, Fallback> =
	| OutcomeOf<Exclude<Marked, FallsBack>>
	| ([Extract<Marked, FallsBack>] extends [never] ? never : Fallback);

/** What the general hook answers a refusal of `Kind` with, or, without one, the marked default. */
type GeneralOutcome<Shortcuts, Kind extends RefusalKind> = [
	GeneralRefusals<Shortcuts>,
] extends [never]
	? MarkedDefault<Kind>
	: Answered<GeneralRefusals<Shortcuts>, PlainDefault<Kind>>;

/**
 * The outcomes a refusal of `Kind` may get: the replies of the hook of
 * that kind, and, when it may return nothing or there is none, what the
 * general hook answers, or the default of the kind.
 */
export type KindOutcome<Shortcuts, Kind extends RefusalKind> = [
	Extract<Shortcuts, RefusingKind<Kind>>,
] extends [never]
	? GeneralOutcome<Shortcuts, Kind>
	: Answered<
			Extract<Shortcuts, RefusingKind<Kind>>,
			GeneralOutcome<Shortcuts, Kind>
		>;

/**
 * The outcomes a refused request may get: those of a `validation` refusal
 * on a route that `Validates`, and of a `body_limit` one on a route that
 * is `Limited` — each the replies of the hook of its kind, of the general
 * hook, whose reply does not depend on the kind in its type, or the
 * default of the kind: the 400, the 413.
 */
export type RefusalOutcome<
	Shortcuts,
	Validates extends boolean = true,
	Limited extends boolean = false,
> =
	| (Validates extends true ? KindOutcome<Shortcuts, 'validation'> : never)
	| (Limited extends true ? KindOutcome<Shortcuts, 'body_limit'> : never);

/**
 * `Shortcuts`, then the shortcuts of a later scope: its general hook's
 * refusals, if any, replace all of these; else its hook of a kind
 * replaces these of that kind.
 */
export type ThenShortcuts<Shortcuts, Later> = [GeneralRefusals<Later>] extends [
	never,
]
	?
			| Exclude<
					Shortcuts,
					RefusingKind<Extract<Later, RefusingKind<RefusalKind>>['~kind']>
			  >
			| Later
	: Exclude<Shortcuts, Refusing> | Later;

/**
 * `Output`, a route of a plugin, behind the hooks of the app using it: its
 * default 400 and 413 replaced by the app's refusals, and the app's other
 * replies added. The app's `bodyLimit()` does not reach it: a plugin's
 * route keeps the limit it was declared with.
 */
export type BehindShortcuts<Output, Shortcuts> =
	| ([Extract<Shortcuts, Refusing>] extends [never]
			? Output
			:
					| Exclude<Output, DefaultRefusalOutcome | DefaultLimitOutcome>
					| ([Extract<Output, DefaultRefusalOutcome>] extends [never]
							? never
							: KindOutcome<Shortcuts, 'validation'>)
					| ([Extract<Output, DefaultLimitOutcome>] extends [never]
							? never
							: KindOutcome<Shortcuts, 'body_limit'>))
	| OutcomeOf<Exclude<Shortcuts, Refusing | BodyLimited>>;

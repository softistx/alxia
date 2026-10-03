/**
 * How an app's type carries its `onRefusal` hook: what the hook may
 * declare, and the marked replies that take the place of the default 400
 * in the type of each route after it that validates, and of the default
 * 413 in the type of each route under a `bodyLimit`.
 */
import type {
	ContentTooLargeBody,
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
 * The mark, among an app's shortcuts, of each reply its `onRefusal` hook
 * answers a refused request with: they replace the default 400 of a route
 * that validates, and are no part of a route that does not.
 */
export interface Refusing {
	readonly '~refusal': true;
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

/**
 * The outcomes a refused request may get: every reply of the hook in force,
 * on every route it may refuse — one that `Validates` or is `Limited`,
 * since its reply does not depend on the kind in its type — or the default
 * of each kind the route may refuse with: the 400 of a route that
 * `Validates`, the 413 of one that is `Limited`.
 */
export type RefusalOutcome<
	Shortcuts,
	Validates extends boolean = true,
	Limited extends boolean = false,
> = [Extract<Shortcuts, Refusing>] extends [never]
	?
			| (Validates extends true ? DefaultRefusalOutcome : never)
			| (Limited extends true ? DefaultLimitOutcome : never)
	: [Validates | Limited] extends [false]
		? never
		:
				| OutcomeOf<Exclude<Extract<Shortcuts, Refusing>, FallsBack>>
				| ([Extract<Shortcuts, FallsBack>] extends [never]
						? never
						:
								| (Validates extends true
										? Outcome<400, ValidationErrorBody>
										: never)
								| (Limited extends true
										? Outcome<413, Jsonify<ContentTooLargeBody>>
										: never));

/** `Shortcuts`, then the shortcuts of a later scope: its refusals, if any, replace these. */
export type ThenShortcuts<Shortcuts, Later> = [
	Extract<Later, Refusing>,
] extends [never]
	? Shortcuts | Later
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
							: RefusalOutcome<Shortcuts, true, false>)
					| ([Extract<Output, DefaultLimitOutcome>] extends [never]
							? never
							: RefusalOutcome<Shortcuts, false, true>))
	| OutcomeOf<Exclude<Shortcuts, Refusing | BodyLimited>>;

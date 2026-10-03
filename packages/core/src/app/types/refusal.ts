/**
 * How an app's type carries its `onRefusal` hook: what the hook may
 * declare, and the marked replies that take the default 400's place in
 * the type of each route after it that validates.
 */
import type { ValidationErrorBody } from '../../errors/errors';
import type { Reply } from '../../reply/reply';
import type {
	InferOutput,
	StandardSchemaV1,
} from '../../schema/standard-schema';
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

/** The outcomes a refused request may get: the hook's in force, or the default. */
export type RefusalOutcome<Shortcuts> = [Extract<Shortcuts, Refusing>] extends [
	never,
]
	? DefaultRefusalOutcome
	:
			| OutcomeOf<Exclude<Extract<Shortcuts, Refusing>, FallsBack>>
			| ([Extract<Shortcuts, FallsBack>] extends [never]
					? never
					: Outcome<400, ValidationErrorBody>);

/** `Shortcuts`, then the shortcuts of a later scope: its refusals, if any, replace these. */
export type ThenShortcuts<Shortcuts, Later> = [
	Extract<Later, Refusing>,
] extends [never]
	? Shortcuts | Later
	: Exclude<Shortcuts, Refusing> | Later;

/**
 * `Output`, a route of a plugin, behind the hooks of the app using it: its
 * default 400 replaced by the app's refusals, and the app's other replies
 * added.
 */
export type BehindShortcuts<Output, Shortcuts> =
	| ([Extract<Shortcuts, Refusing>] extends [never]
			? Output
			: [Extract<Output, DefaultRefusalOutcome>] extends [never]
				? Output
				: Exclude<Output, DefaultRefusalOutcome> | RefusalOutcome<Shortcuts>)
	| OutcomeOf<Exclude<Shortcuts, Refusing>>;

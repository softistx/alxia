/** The record of an app's routes the client is typed from: what each one takes and answers. */
import type { InternalErrorBody } from '../../errors/errors';
import type { Reply } from '../../reply/reply';
import type { InferInput, InferOutput } from '../../schema/standard-schema';
import type { Jsonify, Simplify } from '../../types/json';
import type { PathParamName } from '../../types/path';
import type { RedirectStatus } from '../../types/status';
import type { Empty, Method } from './common';
import type { RefusalOutcome, Refusing } from './refusal';
import type {
	ResponseSchemaAt,
	ResponsesOf,
	SchemaAt,
	StatusOf,
} from './schema';

/** One outcome of a call: a status, and the body read from it. */
export interface Outcome<Status extends number = number, Data = unknown> {
	readonly status: Status;
	readonly data: Data;
}

/** The outcomes of the replies in `Replies`. */
export type OutcomeOf<Replies> =
	Replies extends Reply<infer Status, infer Body>
		? Outcome<Status, Jsonify<Body>>
		: never;

type ValidatesRequest<Schema> = [
	SchemaAt<Schema, 'params' | 'query' | 'headers' | 'cookies' | 'body'>,
] extends [never]
	? false
	: true;

/** Every outcome a client may read from a route. */
export type RouteOutput<Schema, Result, Shortcuts> =
	| ([ResponsesOf<Schema>] extends [never]
			? OutcomeOf<Result>
			:
					| {
							[Status in StatusOf<ResponsesOf<Schema>>]: Outcome<
								Status,
								Jsonify<
									InferOutput<ResponseSchemaAt<ResponsesOf<Schema>, Status>>
								>
							>;
					  }[StatusOf<ResponsesOf<Schema>>]
					| OutcomeOf<Extract<Result, Reply<RedirectStatus, undefined>>>)
	| OutcomeOf<Exclude<Shortcuts, Refusing>>
	| (ValidatesRequest<Schema> extends true ? RefusalOutcome<Shortcuts> : never)
	| Outcome<500, InternalErrorBody>;

type PartInput<Schema, Key extends 'query' | 'headers' | 'cookies' | 'body'> = [
	SchemaAt<Schema, Key>,
] extends [never]
	? Empty
	: undefined extends InferInput<SchemaAt<Schema, Key>>
		? { readonly [Part in Key]?: InferInput<SchemaAt<Schema, Key>> }
		: Empty extends InferInput<SchemaAt<Schema, Key>>
			? { readonly [Part in Key]?: InferInput<SchemaAt<Schema, Key>> }
			: { readonly [Part in Key]: InferInput<SchemaAt<Schema, Key>> };

/** Cookies are optional to a client: a browser sends its own. */
type CookiesInput<Schema> = [SchemaAt<Schema, 'cookies'>] extends [never]
	? Empty
	: { readonly cookies?: InferInput<SchemaAt<Schema, 'cookies'>> };

type ParamsInput<Path extends string> = [PathParamName<Path>] extends [never]
	? Empty
	: {
			readonly params: {
				readonly [Name in PathParamName<Path>]: string | number;
			};
		};

/** What a client sends a route. */
export type RouteInput<Path extends string, Schema> = Simplify<
	ParamsInput<Path> &
		PartInput<Schema, 'query'> &
		PartInput<Schema, 'headers'> &
		CookiesInput<Schema> &
		PartInput<Schema, 'body'>
>;

/** A route, as the client knows it. */
export interface RouteRecord<Input = unknown, Output = unknown> {
	readonly input: Input;
	readonly output: Output;
}

/** Routes by path, then by method. */
export type RouteTable = {
	readonly [path: string]: { readonly [method in Method]?: RouteRecord };
};

export type RouteEntryOf<
	M extends Method,
	Path extends string,
	Schema,
	Result,
	Shortcuts,
> = {
	readonly [P in Path]: {
		readonly [Key in M]: RouteRecord<
			RouteInput<Path, Schema>,
			RouteOutput<Schema, Result, Shortcuts>
		>;
	};
};

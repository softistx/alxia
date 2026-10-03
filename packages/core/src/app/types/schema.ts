/**
 * What a route declares: its schemas, and the helpers that read one part
 * of them back.
 */
import type {
	InferOutput,
	StandardSchemaV1,
} from '../../schema/standard-schema';
import type { StatusCode } from '../../types/status';

/** A schema per status the route may answer. */
export type ResponseSchemas = {
	readonly [Status in StatusCode]?: StandardSchemaV1;
};

/** What OpenAPI says of a route, and nothing at runtime. */
export interface RouteDetail {
	readonly summary?: string;
	readonly description?: string;
	readonly operationId?: string;
	readonly tags?: readonly string[];
	readonly deprecated?: boolean;
}

/**
 * What a route validates. Every part is optional, and each one may be any
 * Standard Schema: Zod, Valibot, ArkType, or one written by hand.
 */
export interface RouteSchema {
	/** The path parameters, which arrive as strings: a schema that coerces reads `/users/:id` as a number. */
	readonly params?: StandardSchemaV1;
	/** The query string: a key given once is a string, given more than once an array. */
	readonly query?: StandardSchemaV1;
	/** The request headers, names lowercased. */
	readonly headers?: StandardSchemaV1;
	/** The request cookies, by name. */
	readonly cookies?: StandardSchemaV1;
	/** The body, read as its `content-type` says: JSON, a form, or text. */
	readonly body?: StandardSchemaV1;
	/** The body of each status the route may answer. Its handler can answer no other. */
	readonly response?: ResponseSchemas;
	/**
	 * The most bytes the request body may hold, past which it is refused
	 * with a 413: checked on its `Content-Length`, then counted as it is
	 * read, by core's parsers or by the handler reading `request.body`.
	 * Overrides a `bodyLimit()` declared before the route.
	 */
	readonly bodyLimit?: number;
	readonly detail?: RouteDetail;
}

/*
 * The helpers below read one part of a route's schema back, for the other
 * files of this folder: `index.ts` does not export them.
 */

/** The schema a route declares for `Key`, or `never`. */
export type SchemaAt<
	Schema,
	Key extends keyof RouteSchema,
> = Key extends keyof Schema
	? Schema[Key] extends StandardSchemaV1
		? Schema[Key]
		: never
	: never;

/** The output of the schema at `Key`, or `Fallback` when the route declares none. */
export type OutputAt<Schema, Key extends keyof RouteSchema, Fallback> = [
	SchemaAt<Schema, Key>,
] extends [never]
	? Fallback
	: InferOutput<SchemaAt<Schema, Key>>;

/** The `response` schemas a route declares, or `never`. */
export type ResponsesOf<Schema> = Schema extends {
	readonly response: infer Responses extends ResponseSchemas;
}
	? Responses
	: never;

/** The statuses among `Responses`. */
export type StatusOf<Responses> = keyof Responses & StatusCode;

/** The schema `Responses` declares for `Status`, or `never`. */
export type ResponseSchemaAt<Responses, Status> = Status extends keyof Responses
	? Exclude<Responses[Status], undefined> extends infer Schema extends
			StandardSchemaV1
		? Schema
		: never
	: never;

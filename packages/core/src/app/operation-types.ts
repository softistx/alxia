/**
 * What a route declared from an operation threads: the operation's
 * `responds`, first, and its `validate`, just before the handler.
 */
import type { InferOutput, StandardSchemaV1 } from '../schema/standard-schema';
import type { AppTypes } from './route-forms';
import type { OperationSchema, RouteOperation } from './route-operation';
import type { Empty, MiddlewareBase, Next } from './types';
import type { RequestSchemas } from './validate';

/** The request parts an operation's schema validates. */
export type OperationParts<Operation> = Pick<
	OperationSchema<Operation>,
	keyof OperationSchema<Operation> & keyof RequestSchemas
>;

/** What an operation gives a route besides its schemas: its `bodyLimit`, its `detail`. */
export type OperationOptions<Operation> = Omit<
	OperationSchema<Operation>,
	keyof RequestSchemas | 'response'
>;

/** The implicit `responds` of an operation, first on its route. */
export type OperationResponds<Operation> =
	OperationSchema<Operation> extends {
		readonly response: infer Responses extends object;
	}
		? Next<Empty, { readonly response: Responses }>
		: Next;

/** The output of the operation's schema for `Part`, or `Before`'s when it has none. */
type PartOutput<Operation, Part extends keyof RequestSchemas, Before> =
	OperationSchema<Operation> extends {
		readonly [Key in Part]: infer Schema extends StandardSchemaV1;
	}
		? InferOutput<Schema>
		: Part extends keyof Before
			? Before[Part]
			: undefined;

/**
 * The implicit `validate` of an operation, just before its handler, after
 * the middlewares that built `Before`. What it adds names every part: the
 * output of the operation's schema, or, for a part it has none for, the
 * part as `Before` holds it — the request's own, or what a middleware
 * passed on. Keys known before the operation is: the route threads them
 * cheaply, where keys read off the operation made TypeScript give up with
 * TS2590 once a route had two middlewares.
 */
export type OperationValidate<
	Operation extends RouteOperation,
	Before = MiddlewareBase<Empty, Operation['path']>,
> = Next<
	{
		readonly params: PartOutput<Operation, 'params', Before>;
		readonly query: PartOutput<Operation, 'query', Before>;
		readonly headers: PartOutput<Operation, 'headers', Before>;
		readonly cookies: PartOutput<Operation, 'cookies', Before>;
		readonly body: PartOutput<Operation, 'body', Before>;
	},
	OperationParts<Operation>
>;

/** The app a route declared from `Operation` belongs to: its method is the operation's. */
export interface OperationApp<
	App extends AppTypes,
	Operation extends RouteOperation,
> extends AppTypes {
	readonly method: Operation['method'];
	readonly ctx: App['ctx'];
	readonly prefix: App['prefix'];
	readonly shortcuts: App['shortcuts'];
}

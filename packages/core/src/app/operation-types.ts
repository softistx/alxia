/**
 * What a route declared from an operation threads: the operation's
 * `responds`, first, and its `validate`, just before the handler.
 */
import type { InferOutput, StandardSchemaV1 } from '../schema/standard-schema';
import type { PathParams } from '../types/path';
import type { AppTypes } from './route-forms';
import type { OperationSchema, RouteOperation } from './route-operation';
import type { Empty, Next, RawRequestParts } from './types';
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

/** The output of the operation's schema for `Part`, or `Raw` when it has none. */
type PartOutput<Operation, Part extends keyof RequestSchemas, Raw> =
	OperationSchema<Operation> extends {
		readonly [Key in Part]: infer Schema extends StandardSchemaV1;
	}
		? InferOutput<Schema>
		: Raw;

/**
 * The implicit `validate` of an operation, just before its handler. What it
 * adds names every part, the request's own for a part it has no schema
 * for: keys known before the operation is, which the route threads cheaply.
 */
export type OperationValidate<
	Operation extends RouteOperation,
	Path extends string = Operation['path'],
> = Next<
	{
		readonly params: PartOutput<Operation, 'params', PathParams<Path>>;
		readonly query: PartOutput<Operation, 'query', RawRequestParts['query']>;
		readonly headers: PartOutput<
			Operation,
			'headers',
			Readonly<Record<string, string>>
		>;
		readonly cookies: PartOutput<
			Operation,
			'cookies',
			Readonly<Record<string, string>>
		>;
		readonly body: PartOutput<Operation, 'body', undefined>;
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
	readonly routes: App['routes'];
	readonly prefix: App['prefix'];
	readonly shortcuts: App['shortcuts'];
}

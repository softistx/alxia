/** The checks of a route's schema its type cannot express on its own. */
import type {
	InferInput,
	StandardSchemaV1,
} from '../../schema/standard-schema';
import type { PathParamName, PathParams } from '../../types/path';
import type { StatusCode } from '../../types/status';
import type { RouteSchema } from './schema';

/**
 * The checks the type of a route's schema cannot express on its own. A
 * mistake comes back as a property whose type is the message.
 */
export type ValidSchema<Path extends string, Schema> = UnknownKeys<Schema> &
	ParamsMatchPath<Path, Schema> &
	KnownStatuses<Schema>;

type UnknownKeys<Schema> = [Exclude<keyof Schema, keyof RouteSchema>] extends [
	never,
]
	? unknown
	: {
			readonly [Key in Exclude<
				keyof Schema,
				keyof RouteSchema
			>]: `"${Key & string}" is not a part of a route: params, query, headers, cookies, body, response, bodyLimit or detail`;
		};

/** One message per key the path does not declare, or one for them all when no key can be named. */
type UndeclaredParams<Keys, Path extends string> = [
	Keys & (string | number),
] extends [never]
	? `the params schema reads keys "${Path}" does not declare`
	: `the params schema reads "${Keys & (string | number)}", which "${Path}" does not declare`;

type ParamsMatchPath<Path extends string, Schema> = Schema extends {
	readonly params: infer Params extends StandardSchemaV1;
}
	? PathParams<Path> extends InferInput<Params>
		? keyof InferInput<Params> extends PathParamName<Path>
			? unknown
			: {
					readonly params: UndeclaredParams<
						Exclude<keyof InferInput<Params>, PathParamName<Path>>,
						Path
					>;
				}
		: {
				readonly params: `the params schema must accept the parameters of "${Path}", which arrive as strings`;
			}
	: unknown;

type KnownStatuses<Schema> = Schema extends {
	readonly response: infer Responses;
}
	? [Exclude<keyof Responses, StatusCode>] extends [never]
		? unknown
		: {
				readonly response: `${Exclude<keyof Responses, StatusCode> & (string | number)} is not an HTTP status`;
			}
	: unknown;

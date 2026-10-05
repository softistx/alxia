/**
 * `validate` and `responds`: a route's schemas, as middlewares. The chain
 * runs them where they stand among the route's middlewares.
 */
import type {
	InferInput,
	InferOutput,
	StandardSchemaV1,
} from '../schema/standard-schema';
import type { StatusCode } from '../types/status';
import type { RouteOperation } from './route-operation';
import type {
	BuiltinMark,
	Empty,
	Middleware,
	Next,
	ResponseSchemas,
	RouteSchema,
} from './types';

/** What `validate` reads of the request: any part, each any Standard Schema. */
export type RequestSchemas = Pick<
	RouteSchema,
	'params' | 'query' | 'headers' | 'cookies' | 'body'
>;

/** What `validate(schemas)` passes on: the output of each schema, by part. */
export type Validated<Schemas> = {
	readonly [Part in keyof Schemas &
		keyof RequestSchemas]: Schemas[Part] extends StandardSchemaV1
		? InferOutput<Schemas[Part]>
		: never;
};

/**
 * What `validate` reads of the route: the path parameters its `params`
 * schema takes, which must be the path's, as strings. Each is required,
 * an optional one included: a path declares every parameter it has, so a
 * key the schema reads and the path lacks is refused.
 */
export type ValidateRequires<Schemas> = Schemas extends {
	readonly params: infer Params extends StandardSchemaV1;
}
	? {
			readonly pathParams: {
				readonly [Name in keyof InferInput<Params>]-?: InferInput<Params>[Name];
			};
		}
	: Empty;

/**
 * What `validate` was given: request schemas, or an operation, whose
 * request parts it reads from its `schema`.
 */
type PartsOf<Given> = Given extends RouteOperation
	? Given extends { readonly schema: infer Schema extends object }
		? Pick<Schema, keyof Schema & keyof RequestSchemas>
		: Empty
	: Given;

type KnownParts<Schemas> = Schemas extends RouteOperation
	? unknown
	: [Exclude<keyof Schemas, keyof RequestSchemas>] extends [never]
		? unknown
		: {
				readonly [Key in Exclude<
					keyof Schemas,
					keyof RequestSchemas
				>]: `"${Key & string}" is not a part validate() reads: params, query, headers, cookies or body`;
			};

type KnownStatuses<Responses> = [Exclude<keyof Responses, StatusCode>] extends [
	never,
]
	? unknown
	: {
			readonly [Key in Exclude<
				keyof Responses,
				StatusCode
			>]: `${Key & (string | number)} is not an HTTP status`;
		};

/** A step the chain runs itself, rather than as a function: what `validate` and `responds` make. */
export type BuiltinStep =
	| { readonly kind: 'validate'; readonly schemas: RequestSchemas }
	| { readonly kind: 'responds'; readonly responses: ResponseSchemas };

/**
 * Where a middleware made by `validate` or `responds` carries its step: a
 * symbol of the global registry, as `defineMiddleware`'s mark, so that a
 * `validate` of another copy of `@alxia/core` — a duplicate install, a
 * plugin that bundles it — is still recognised.
 */
const BUILTIN: unique symbol = Symbol.for('alxia.builtin');

/** The step a middleware made by `validate` or `responds` stands for, or nothing. */
export function builtinOf(middleware: unknown): BuiltinStep | undefined {
	return (middleware as { [BUILTIN]?: BuiltinStep } | null | undefined)?.[
		BUILTIN
	];
}

/*
 * `validate` and `responds` return `NoInfer<…>`: written inline among a
 * route's middlewares, their call would otherwise infer its schemas from
 * the overload the route method tries, and type the handler by the wrong
 * one.
 */

/**
 * A middleware that validates the request: each part a schema is given
 * for — `params`, `query`, `headers`, `cookies`, `body` — with any Standard
 * Schema. It passes their output on, typed, to what follows it; a request
 * they refuse throws a `ValidationError`, which a middleware before it may
 * answer, and the route answers `400 { error: 'validation', issues }`
 * otherwise. It stands where it is given: an
 * `auth` before it answers a stranger 401 before his body is read.
 *
 * ```ts
 * app.patch('/posts/:id', auth, validate({ params: PostId, body: Update }),
 *   ({ params, body, reply }) => reply(200, update(params.id, body)));
 * ```
 *
 * The middlewares before it read the request as it arrived, its cookies
 * included, after `next()` too; what follows it reads the validated ones.
 *
 * Given an operation, `{ method, path, schema }`, it validates the request
 * parts of its `schema`: on `app.route(operation, …)`, where it stands
 * replaces the validation the route would run just before its handler.
 */
export function validate<const Schemas extends RequestSchemas | RouteOperation>(
	schemas: Schemas & KnownParts<Schemas>,
): NoInfer<
	Middleware<
		ValidateRequires<PartsOf<Schemas>>,
		Next<Validated<PartsOf<Schemas>>, PartsOf<Schemas>>
	> &
		BuiltinMark<'validate'>
> {
	if (isOperation(schemas)) {
		const parts = Object.fromEntries(
			PARTS.flatMap((part) => {
				const schema = schemas.schema?.[part];
				return schema === undefined ? [] : [[part, schema]];
			}),
		);
		return builtin({ kind: 'validate', schemas: parts }, 'validate');
	}
	return builtin(
		{ kind: 'validate', schemas: schemas as RequestSchemas },
		'validate',
	);
}

const PARTS = ['params', 'query', 'headers', 'cookies', 'body'] as const;

function isOperation(given: unknown): given is RouteOperation {
	return (
		given !== null &&
		typeof given === 'object' &&
		typeof (given as { method?: unknown }).method === 'string' &&
		typeof (given as { path?: unknown }).path === 'string'
	);
}

/** What `responds` was given: response schemas, or an operation, whose `schema.response` it reads. */
type ResponsesIn<Given> = Given extends RouteOperation
	? Given extends { readonly schema: { readonly response: infer Responses } }
		? Responses
		: Empty
	: Given;

/**
 * A middleware that checks the handler's reply against the schema it
 * declares for its status, and sends it as that schema's output: an
 * unknown key the schema strips never leaves the server. A status it does
 * not declare, or a body its schema refuses, is a 500, unless the app was
 * made with `validateResponses: false`, which skips the check of the body.
 * The handler's `reply` is typed by it: only a declared status, with a
 * body its schema takes.
 *
 * ```ts
 * app.get('/posts/:id', responds({ 200: Post, 404: NotFound }), ({ reply }) =>
 *   reply.notFound({ error: 'no such post' }));
 * ```
 *
 * A reply of a middleware after it is checked when its status is declared,
 * and sent as it is otherwise, as the route's type says; one of a
 * middleware before it is not checked. Its type is the middleware's own,
 * not the schema's: a declared status with a body the schema refuses
 * compiles, and is answered 500 like the handler's. A redirect passes. A
 * socket route refuses it: it sends no reply.
 *
 * Given an operation, it checks the responses of its `schema`: on
 * `app.route(operation, …)`, where it stands replaces the check the route
 * runs just before its handler, so that the replies of the middlewares
 * after it are checked too.
 */
export function responds<const Given extends ResponseSchemas | RouteOperation>(
	responses: Given &
		(Given extends RouteOperation ? unknown : KnownStatuses<Given>),
): NoInfer<
	Middleware<Empty, Next<Empty, { readonly response: ResponsesIn<Given> }>> &
		BuiltinMark<'responds'>
> {
	if (isOperation(responses)) {
		const declared = responses.schema?.response;
		if (declared === undefined) {
			throw new TypeError(
				`responds(): the operation ${responses.method} ${responses.path} declares no response`,
			);
		}
		return builtin({ kind: 'responds', responses: declared }, 'responds');
	}
	return builtin(
		{ kind: 'responds', responses: responses as ResponseSchemas },
		'responds',
	);
}

function builtin(step: BuiltinStep, name: string): never {
	const schemas = step.kind === 'validate' ? step.schemas : step.responses;
	if (schemas === null || typeof schemas !== 'object') {
		throw new TypeError(`${name}(): the schemas are not an object`);
	}
	const middleware = () => {
		throw new TypeError(
			`${name}() runs among a route's middlewares, not called on its own`,
		);
	};
	return Object.defineProperty(middleware, BUILTIN, { value: step }) as never;
}

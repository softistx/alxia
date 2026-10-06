import { type DocumentNode, print, type TypedQueryDocumentNode } from 'graphql';

/**
 * A document that carries its types: `graphql`'s own `TypedQueryDocumentNode`,
 * or the `TypedDocumentNode` of `@graphql-typed-document-node/core` that
 * GraphQL Code Generator writes, read by its `__apiType` marker. Both are a
 * `DocumentNode` with an optional function, so neither package is imported.
 */
export type QueryDocument<TData = unknown, TVars = Record<string, unknown>> =
	| string
	| TypedQueryDocumentNode<TData extends object ? TData : never, TVars>
	| (DocumentNode & { __apiType?: (variables: TVars) => TData });

/** One entry of a response's `errors`. */
export interface ResponseError {
	readonly message: string;
	readonly path?: readonly (string | number)[];
	readonly extensions?: {
		readonly code?: string;
		readonly [key: string]: unknown;
	};
}

/** What `query` resolves to: the HTTP status, the parsed body, the response. */
export interface GraphQLResult<TData = unknown> {
	readonly status: number;
	readonly data?: TData | null;
	readonly errors?: readonly ResponseError[];
	/** The response, its body still unread: `headers`, `ok`. */
	readonly response: Response;
}

export interface GraphQLClientOptions {
	/** The endpoint's path. Default `/graphql`. */
	readonly path?: string;
	/** Sent with every query: an `authorization` header, a CSRF one. */
	readonly headers?: HeadersInit;
}

export interface QueryOptions<TVars = Record<string, unknown>> {
	readonly variables?: TVars;
	readonly operationName?: string;
	/** Added to the client's, and replacing one of the same name. */
	readonly headers?: HeadersInit;
}

export interface GraphQLClient {
	query<TData = unknown, TVars = Record<string, unknown>>(
		document: QueryDocument<TData, TVars>,
		options?: QueryOptions<TVars>,
	): Promise<GraphQLResult<TData>>;
}

/** What it calls: an alxia app, or anything with a `fetch(Request)`. */
export interface Servable {
	fetch(request: Request): Response | Promise<Response>;
}

/**
 * Sends operations to an app's GraphQL endpoint in process, through
 * `app.fetch`: no port, no server, the whole chain (middlewares, body limit,
 * Yoga's plugins) in play. Meant for specs; import it from
 * `@alxia/graphql/testing`, never from the app.
 *
 * A body that is not JSON (a 413 from a body limit, a 404) leaves `data` and
 * `errors` unset: read `status`, or `response`'s headers.
 */
export function graphqlClient(
	app: Servable,
	options: GraphQLClientOptions = {},
): GraphQLClient {
	const { path = '/graphql' } = options;
	return {
		async query(document, call = {}) {
			const headers = new Headers(options.headers);
			headers.set('content-type', 'application/json');
			for (const [name, value] of new Headers(call.headers)) {
				headers.set(name, value);
			}
			const body = JSON.stringify({
				query: typeof document === 'string' ? document : print(document),
				variables: call.variables,
				operationName: call.operationName,
			});
			const response = await app.fetch(
				new Request(new URL(path, 'http://localhost'), {
					method: 'POST',
					headers,
					body,
				}),
			);
			const text = await response.clone().text();
			return { status: response.status, ...parse(text), response };
		},
	};
}

/** `data` and `errors` of a JSON object body, each only when it has one. */
function parse<TData>(text: string): {
	data?: TData | null;
	errors?: readonly ResponseError[];
} {
	try {
		const body: unknown = JSON.parse(text);
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			return {};
		}
		const { data, errors } = body as Record<string, unknown>;
		return {
			...(data === undefined ? {} : { data: data as TData | null }),
			...(errors === undefined
				? {}
				: { errors: errors as readonly ResponseError[] }),
		};
	} catch {
		return {};
	}
}

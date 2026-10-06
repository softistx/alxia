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

/** How the operation travels: a JSON body, or the URL's query string. */
export type HttpMethod = 'GET' | 'POST';

export interface GraphQLClientOptions {
	/** The endpoint's path. Default `/graphql`. */
	readonly path?: string;
	/**
	 * Sent with every query: an `authorization` header, and the CSRF one the
	 * app's `useCSRFPrevention` asks of a `GET` (the client sends none of its
	 * own: its name is the app's).
	 */
	readonly headers?: HeadersInit;
	/** How a call is sent unless it says. Default `'POST'`. */
	readonly method?: HttpMethod;
}

export interface QueryOptions<TVars = Record<string, unknown>> {
	readonly variables?: TVars;
	readonly operationName?: string;
	/** Added to the client's, and replacing one of the same name. */
	readonly headers?: HeadersInit;
	/** This call's method, over the client's. */
	readonly method?: HttpMethod;
	/**
	 * Sent as `extensions`, beside the `persistedQuery` that `persisted`
	 * adds: what an app that reads an operation's id from its own extension
	 * (`extractPersistedOperationId`) is sent.
	 */
	readonly extensions?: Record<string, unknown>;
	/**
	 * The hash of a persisted operation, sent as Apollo's
	 * `extensions.persistedQuery: { version: 1, sha256Hash }`, the shape of
	 * `@graphql-yoga/plugin-persisted-operations` by default. With a
	 * document it is sent too; alone, only it is.
	 */
	readonly persisted?: string;
}

/**
 * A call with no document: the operation is the one `persisted` names, or
 * the one an app reads from the `extensions` it is sent (an id).
 */
export type PersistedQueryOptions<TVars = Record<string, unknown>> =
	QueryOptions<TVars> &
		(
			| { readonly persisted: string }
			| { readonly extensions: Record<string, unknown> }
		);

export interface GraphQLClient {
	query<TData = unknown, TVars = Record<string, unknown>>(
		document: QueryDocument<TData, TVars>,
		options?: QueryOptions<TVars>,
	): Promise<GraphQLResult<TData>>;
	/** A persisted operation, by its hash or id alone: name `TData` yourself. */
	query<TData = unknown, TVars = Record<string, unknown>>(
		options: PersistedQueryOptions<TVars>,
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
 * It POSTs JSON, or with `method: 'GET'` puts `query`, `variables`,
 * `operationName` and `extensions` in the URL. A body that is not JSON (a 413
 * from a body limit, a 404) leaves `data` and `errors` unset: read `status`,
 * or `response`'s headers.
 */
export function graphqlClient(
	app: Servable,
	options: GraphQLClientOptions = {},
): GraphQLClient {
	const { path = '/graphql' } = options;
	return {
		async query(
			first: QueryDocument | PersistedQueryOptions,
			second: QueryOptions = {},
		) {
			const [document, call] = isCall(first)
				? [undefined, first]
				: [first, second];
			const response = await app.fetch(
				buildRequest(path, document, call, options),
			);
			const text = await response.clone().text();
			return { status: response.status, ...parse(text), response };
		},
	} as GraphQLClient;
}

/** A call's options, not a document: a `DocumentNode` has a `kind`. */
function isCall(
	value: QueryDocument | PersistedQueryOptions,
): value is PersistedQueryOptions {
	return typeof value === 'object' && !('kind' in value);
}

/** The operation's parts, each only when the call has it. */
function payload(
	document: QueryDocument | undefined,
	call: QueryOptions,
): Record<string, unknown> {
	const extensions = {
		...call.extensions,
		...(call.persisted === undefined
			? {}
			: { persistedQuery: { version: 1, sha256Hash: call.persisted } }),
	};
	return {
		...(document === undefined
			? {}
			: { query: typeof document === 'string' ? document : print(document) }),
		...(call.variables === undefined ? {} : { variables: call.variables }),
		...(call.operationName === undefined
			? {}
			: { operationName: call.operationName }),
		...(Object.keys(extensions).length === 0 ? {} : { extensions }),
	};
}

function buildRequest(
	path: string,
	document: QueryDocument | undefined,
	call: QueryOptions,
	client: GraphQLClientOptions,
): Request {
	const headers = new Headers(client.headers);
	for (const [name, value] of new Headers(call.headers)) {
		headers.set(name, value);
	}
	const url = new URL(path, 'http://localhost');
	const parts = payload(document, call);
	if ((call.method ?? client.method ?? 'POST') === 'GET') {
		// `variables` and `extensions` are JSON in the URL, as Yoga reads them.
		for (const [name, value] of Object.entries(parts)) {
			url.searchParams.set(
				name,
				typeof value === 'string' ? value : JSON.stringify(value),
			);
		}
		return new Request(url, { method: 'GET', headers });
	}
	headers.set('content-type', 'application/json');
	return new Request(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(parts),
	});
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

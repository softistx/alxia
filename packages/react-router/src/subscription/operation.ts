/**
 * Reading what a client asks the proxy to run, and deciding whether the
 * allow-list lets it through. No GraphQL parser: the document is only scanned
 * for its top-level definitions, and anything that is not a named
 * `subscription` of the list is refused, so a mutation or a query cannot ride
 * along in a document that also holds an allowed operation.
 */

/** What a client sent, as graphql-sse's distinct connections mode carries it. */
export interface SubscriptionRequest {
	readonly query?: string;
	readonly operationName?: string;
	readonly variables?: unknown;
	readonly extensions?: Record<string, unknown>;
}

export type Verdict =
	| { readonly ok: true; readonly operation: string }
	| {
			readonly ok: false;
			readonly status: 400 | 403;
			readonly message: string;
	  };

const MAX_BODY = 256 * 1024;

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function jsonParam(value: string | null): unknown {
	if (value === null || value === '') return undefined;
	return JSON.parse(value);
}

/** The request's operation: a GET's search params, or a POST's JSON body. Throws a `TypeError` worded for the client. */
export async function readSubscriptionRequest(
	request: Request,
): Promise<SubscriptionRequest> {
	let raw: Record<string, unknown> | undefined;
	try {
		if (request.method === 'GET') {
			const params = new URL(request.url).searchParams;
			raw = {
				query: params.get('query') ?? undefined,
				operationName: params.get('operationName') ?? undefined,
				variables: jsonParam(params.get('variables')),
				extensions: jsonParam(params.get('extensions')),
			};
		} else {
			const text = await request.text();
			if (text.length > MAX_BODY)
				throw new TypeError('The request is too large.');
			raw = record(JSON.parse(text));
		}
	} catch (error) {
		if (error instanceof TypeError) throw error;
		throw new TypeError('The request is not valid JSON.');
	}
	if (raw === undefined)
		throw new TypeError('The request must be a JSON object.');
	const { query, operationName, variables, extensions } = raw;
	if (query !== undefined && typeof query !== 'string')
		throw new TypeError('"query" must be a string.');
	if (operationName !== undefined && typeof operationName !== 'string')
		throw new TypeError('"operationName" must be a string.');
	const ext = extensions === undefined ? undefined : record(extensions);
	if (extensions !== undefined && ext === undefined)
		throw new TypeError('"extensions" must be an object.');
	if (variables !== undefined && record(variables) === undefined)
		throw new TypeError('"variables" must be an object.');
	return {
		...(query === undefined ? {} : { query }),
		...(operationName === undefined ? {} : { operationName }),
		...(variables === undefined ? {} : { variables }),
		...(ext === undefined ? {} : { extensions: ext }),
	};
}

interface Definition {
	readonly kind: string;
	readonly name: string | undefined;
}

/** The top-level definitions of a document: an operation's keyword and name, `{` for a shorthand query, `fragment`. */
export function definitionsOf(document: string): Definition[] {
	const found: Definition[] = [];
	let braces = 0;
	let parens = 0;
	let i = 0;
	let pending: string | undefined; // an operation keyword waiting for its name
	let skipTo: 'brace' | undefined; // after `fragment`, up to its `{`
	let header = false; // between an operation's keyword and its `{`
	const settle = (name: string | undefined): void => {
		if (pending !== undefined) found.push({ kind: pending, name });
		pending = undefined;
	};
	while (i < document.length) {
		const c = document[i] as string;
		if (c === '#') {
			while (
				i < document.length &&
				document[i] !== '\n' &&
				document[i] !== '\r'
			)
				i++;
		} else if (c === '"') {
			if (document.startsWith('"""', i)) {
				const end = document.indexOf('"""', i + 3);
				i = end === -1 ? document.length : end + 3;
			} else {
				i++;
				while (
					i < document.length &&
					document[i] !== '"' &&
					document[i] !== '\n'
				) {
					i += document[i] === '\\' ? 2 : 1;
				}
				i++;
			}
		} else if (c === '{') {
			if (braces === 0 && parens === 0) {
				if (skipTo === 'brace') skipTo = undefined;
				else if (header) {
					settle(undefined);
					header = false;
				} else found.push({ kind: '{', name: undefined });
			}
			braces++;
			i++;
		} else if (c === '}') {
			braces = Math.max(0, braces - 1);
			i++;
		} else if (c === '(') {
			parens++;
			i++;
		} else if (c === ')') {
			parens = Math.max(0, parens - 1);
			i++;
		} else if (/[A-Za-z_]/.test(c)) {
			let j = i + 1;
			while (j < document.length && /[0-9A-Za-z_]/.test(document[j] as string))
				j++;
			const word = document.slice(i, j);
			if (braces === 0 && parens === 0 && skipTo === undefined) {
				if (pending !== undefined) settle(word);
				else if (word === 'fragment') {
					found.push({ kind: 'fragment', name: undefined });
					skipTo = 'brace';
				} else if (
					word === 'query' ||
					word === 'mutation' ||
					word === 'subscription'
				) {
					pending = word;
					header = true;
				}
			}
			i = j;
		} else i++;
	}
	settle(undefined);
	return found;
}

export interface Allowed {
	/** Operation names, or persisted-query ids (`extensions.persistedQuery.sha256Hash`, `extensions.documentId`, `extensions.id`). */
	readonly allow: ReadonlySet<string>;
}

function persistedId(
	extensions: Record<string, unknown> | undefined,
): string | undefined {
	if (extensions === undefined) return undefined;
	const persisted = record(extensions['persistedQuery'])?.['sha256Hash'];
	for (const id of [persisted, extensions['documentId'], extensions['id']])
		if (typeof id === 'string') return id;
	return undefined;
}

/** Whether the proxy may forward `request`. */
export function judge(
	request: SubscriptionRequest,
	allow: ReadonlySet<string>,
): Verdict {
	if (request.query === undefined || request.query.trim() === '') {
		const id = persistedId(request.extensions);
		if (id === undefined)
			return {
				ok: false,
				status: 400,
				message: 'Send a "query" or a persisted query id.',
			};
		return allow.has(id)
			? { ok: true, operation: id }
			: { ok: false, status: 403, message: 'This operation is not allowed.' };
	}
	const operations = definitionsOf(request.query).filter(
		(d) => d.kind !== 'fragment',
	);
	if (operations.length === 0)
		return {
			ok: false,
			status: 400,
			message: 'The document has no operation.',
		};
	for (const op of operations) {
		if (op.kind !== 'subscription')
			return {
				ok: false,
				status: 403,
				message: 'Only subscriptions are allowed.',
			};
		if (op.name === undefined || !allow.has(op.name))
			return {
				ok: false,
				status: 403,
				message: 'This operation is not allowed.',
			};
	}
	const names = operations.map((op) => op.name as string);
	if (
		request.operationName !== undefined &&
		!names.includes(request.operationName)
	)
		return {
			ok: false,
			status: 400,
			message: 'The operation name is not in the document.',
		};
	if (request.operationName === undefined && names.length > 1)
		return {
			ok: false,
			status: 400,
			message: 'Name the operation to run with "operationName".',
		};
	return { ok: true, operation: request.operationName ?? (names[0] as string) };
}

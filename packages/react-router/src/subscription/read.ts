import { Refusal } from './refusal';

/** The most a body, a query string or the variables may weigh, in bytes. */
export const LIMITS = {
	body: 64 * 1024,
	queryString: 16 * 1024,
	variables: 16 * 1024,
} as const;

export interface Asked {
	readonly operationName: string;
	readonly variables?: Record<string, unknown>;
}

const TOO_LARGE = () =>
	new Refusal(400, 'The request is too large.', 'BAD_REQUEST');
const NOT_JSON = () =>
	new Refusal(400, 'The request is not valid JSON.', 'BAD_REQUEST');

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** The body as text, refused past `limit` bytes: `content-length` first, then a cap on what is read. */
async function textOf(request: Request, limit: number): Promise<string> {
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > limit) throw TOO_LARGE();
	if (request.body === null) return '';
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			void reader.cancel().catch(() => {});
			throw TOO_LARGE();
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw NOT_JSON();
	}
}

/**
 * What a client asks for: an `operationName` and its `variables`, from a
 * GET's search params or a POST's JSON body. Any `query` or `extensions` it
 * sends (graphql-sse always sends a `query`) is ignored.
 */
export async function readAsked(request: Request): Promise<Asked> {
	let raw: Record<string, unknown> | undefined;
	if (request.method === 'GET') {
		const url = new URL(request.url);
		if (url.search.length > LIMITS.queryString) throw TOO_LARGE();
		const variables = url.searchParams.get('variables');
		raw = {
			operationName: url.searchParams.get('operationName') ?? undefined,
			variables: variables ? parse(variables) : undefined,
		};
	} else {
		const type = (request.headers.get('content-type') ?? '')
			.split(';')[0]
			?.trim()
			.toLowerCase();
		if (type !== 'application/json')
			throw new Refusal(
				415,
				'Send the request as application/json.',
				'UNSUPPORTED_MEDIA_TYPE',
			);
		raw = record(parse(await textOf(request, LIMITS.body)));
		if (raw === undefined)
			throw new Refusal(
				400,
				'The request must be a JSON object.',
				'BAD_REQUEST',
			);
	}
	const { operationName, variables } = raw;
	if (operationName === undefined)
		throw new Refusal(400, 'Send an "operationName".', 'BAD_REQUEST');
	if (typeof operationName !== 'string')
		throw new Refusal(400, '"operationName" must be a string.', 'BAD_REQUEST');
	if (variables !== undefined) {
		if (record(variables) === undefined)
			throw new Refusal(400, '"variables" must be an object.', 'BAD_REQUEST');
		if (JSON.stringify(variables).length > LIMITS.variables) throw TOO_LARGE();
	}
	return {
		operationName,
		...(variables === undefined
			? {}
			: { variables: variables as Record<string, unknown> }),
	};
}

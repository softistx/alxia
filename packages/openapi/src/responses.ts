import {
	isEventStreamSchema,
	isNamedEventStreamSchema,
	type RefusalHandler,
	type RefusalKind,
	type RouteDefinition,
	type RouteSchema,
} from '@alxia/core';
import { type Converter, type JsonSchema, toJsonSchema } from './json-schema';
import type { ResponseObject } from './types';

/**
 * A route's responses: each reply its schema declares, `default` when it
 * declares none, its refusals — the 400 when it validates its request, the
 * 413 when it has a `bodyLimit`, or what the `onRefusal` hook in force for
 * each kind declares — and the 500 any route may answer.
 */
export function responses(
	schema: RouteSchema,
	convert?: Converter,
	refusals: Refusals = {},
	bodyLimit?: number,
): Record<string, ResponseObject> {
	const byStatus: Record<string, ResponseObject> = {};
	for (const [status, responseSchema] of Object.entries(
		schema.response ?? {},
	)) {
		if (responseSchema === undefined) continue;
		const json = toJsonSchema(responseSchema, 'output', convert);
		byStatus[status] =
			status === '204' || status === '304'
				? { description: describe(status) }
				: {
						description: describe(status),
						content:
							isEventStreamSchema(responseSchema) ||
							isNamedEventStreamSchema(responseSchema)
								? { 'text/event-stream': { itemSchema: json } }
								: { [contentType(json)]: { schema: json } },
					};
	}
	if (schema.response === undefined) {
		byStatus['default'] = { description: 'The reply of the handler' };
	}
	const validates =
		schema.params !== undefined ||
		schema.query !== undefined ||
		schema.headers !== undefined ||
		schema.cookies !== undefined ||
		schema.body !== undefined;
	if (validates || bodyLimit !== undefined) {
		refused(byStatus, refusals, convert, validates, bodyLimit);
	}
	byStatus['500'] = withError(byStatus['500'], 'The server failed', {
		$ref: '#/components/schemas/InternalError',
	});
	return byStatus;
}

const REFUSED = 'The request was refused';

/** The `onRefusal` hooks in force for a route: the general one, and those of each kind. */
export type Refusals = Pick<RouteDefinition, 'refusal' | 'refusalByKind'>;

/**
 * The responses of a refused request, for each kind the route may refuse
 * with — `validation` when it validates, `body_limit` under a `bodyLimit`
 * — by the hook in force for that kind: its first `onRefusal(kind, hook)`,
 * else the general one. Each status that hook declares, under its content
 * type; for a hook that declares none, a client error whose body it does
 * not say; with no hook, the default 400 or 413.
 */
function refused(
	byStatus: Record<string, ResponseObject>,
	refusals: Refusals,
	convert: Converter | undefined,
	validates: boolean,
	bodyLimit: number | undefined,
): void {
	const tooLarge = `The body is larger than ${bodyLimit} bytes`;
	const kinds: RefusalKind[] = [];
	if (validates) kinds.push('validation');
	if (bodyLimit !== undefined) kinds.push('body_limit');
	// One hook may answer both kinds: its statuses are documented once.
	const inForce = new Map<RefusalHandler, RefusalKind[]>();
	for (const kind of kinds) {
		const handler = refusals.refusalByKind?.[kind]?.[0] ?? refusals.refusal;
		if (handler !== undefined) {
			inForce.set(handler, [...(inForce.get(handler) ?? []), kind]);
		} else if (kind === 'validation') {
			byStatus['400'] = withError(byStatus['400'], REFUSED, {
				$ref: '#/components/schemas/ValidationError',
			});
		} else {
			byStatus['413'] = withError(byStatus['413'], tooLarge, {
				$ref: '#/components/schemas/ContentTooLargeError',
			});
		}
	}
	for (const [handler, answered] of inForce) {
		if (handler.response === undefined) {
			byStatus['4XX'] ??= { description: REFUSED };
			continue;
		}
		for (const [status, schema] of Object.entries(handler.response)) {
			if (schema === undefined) continue;
			byStatus[status] = withError(
				byStatus[status],
				status === '413' && answered.includes('body_limit')
					? tooLarge
					: REFUSED,
				toJsonSchema(schema, 'output', convert),
				handler.contentType,
			);
		}
	}
}

/**
 * The response for a status the framework itself may answer: its error
 * alone, or, when the route declares that status too, the route's beside
 * it — either of the two under one content type, or each under its own.
 */
function withError(
	own: ResponseObject | undefined,
	description: string,
	error: JsonSchema,
	type = 'application/json',
): ResponseObject {
	if (own === undefined) {
		return { description, content: { [type]: { schema: error } } };
	}
	const schema = own.content?.[type]?.schema;
	return {
		description: own.description,
		content: {
			...own.content,
			[type]: {
				schema: schema === undefined ? error : { anyOf: [schema, error] },
			},
		},
	};
}

function contentType(schema: JsonSchema): string {
	return schema['type'] === 'string' ? 'text/plain' : 'application/json';
}

function describe(status: string): string {
	const known: Record<string, string> = {
		'200': 'OK',
		'201': 'Created',
		'202': 'Accepted',
		'204': 'No content',
		'400': 'Bad request',
		'401': 'Unauthorized',
		'403': 'Forbidden',
		'404': 'Not found',
		'409': 'Conflict',
		'422': 'Unprocessable content',
	};
	return known[status] ?? `HTTP ${status}`;
}

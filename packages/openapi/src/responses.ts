import {
	isEventStreamSchema,
	type RefusalHandler,
	isNamedEventStreamSchema,
	type RouteSchema,
} from '@alxia/core';
import { type Converter, type JsonSchema, toJsonSchema } from './json-schema';
import type { ResponseObject } from './types';

/**
 * A route's responses: each reply its schema declares, `default` when it
 * declares none, its refusal when it validates its request — the 400, or
 * what the `onRefusal` hook in force declares — and the 500 any route may
 * answer.
 */
export function responses(
	schema: RouteSchema,
	convert?: Converter,
	refusal?: RefusalHandler,
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
	if (
		schema.params !== undefined ||
		schema.query !== undefined ||
		schema.headers !== undefined ||
		schema.cookies !== undefined ||
		schema.body !== undefined
	) {
		refused(byStatus, refusal, convert);
	}
	byStatus['500'] = withError(byStatus['500'], 'The server failed', {
		$ref: '#/components/schemas/InternalError',
	});
	return byStatus;
}

const REFUSED = 'The request was refused';

/**
 * The responses of a refused request: the default 400; each status the
 * route's `onRefusal` hook declares, under its content type; or, for a hook
 * that declares none, a client error whose body it does not say.
 */
function refused(
	byStatus: Record<string, ResponseObject>,
	refusal: RefusalHandler | undefined,
	convert: Converter | undefined,
): void {
	if (refusal === undefined) {
		byStatus['400'] = withError(byStatus['400'], REFUSED, {
			$ref: '#/components/schemas/ValidationError',
		});
		return;
	}
	if (refusal.response === undefined) {
		byStatus['4XX'] ??= { description: REFUSED };
		return;
	}
	for (const [status, schema] of Object.entries(refusal.response)) {
		if (schema === undefined) continue;
		byStatus[status] = withError(
			byStatus[status],
			REFUSED,
			toJsonSchema(schema, 'output', convert),
			refusal.contentType,
		);
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

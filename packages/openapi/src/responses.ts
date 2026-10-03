import { isEventStreamSchema, type RouteSchema } from '@alxia/core';
import { type Converter, type JsonSchema, toJsonSchema } from './json-schema';
import type { Response } from './types';

/**
 * A route's responses: each reply its schema declares, `default` when it
 * declares none, its 400 when it validates its request, and the 500 any
 * route may answer.
 */
export function responses(
	schema: RouteSchema,
	convert?: Converter,
): Record<string, Response> {
	const responses: Record<string, Response> = {};
	for (const [status, responseSchema] of Object.entries(
		schema.response ?? {},
	)) {
		if (responseSchema === undefined) continue;
		const json = toJsonSchema(responseSchema, 'output', convert);
		responses[status] =
			status === '204' || status === '304'
				? { description: describe(status) }
				: {
						description: describe(status),
						content: isEventStreamSchema(responseSchema)
							? { 'text/event-stream': { itemSchema: json } }
							: { [contentType(json)]: { schema: json } },
					};
	}
	if (schema.response === undefined) {
		responses['default'] = { description: 'The reply of the handler' };
	}
	if (
		schema.params !== undefined ||
		schema.query !== undefined ||
		schema.headers !== undefined ||
		schema.cookies !== undefined ||
		schema.body !== undefined
	) {
		responses['400'] = withError(
			responses['400'],
			'The request was refused',
			'ValidationError',
		);
	}
	responses['500'] = withError(
		responses['500'],
		'The server failed',
		'InternalError',
	);
	return responses;
}

/**
 * The response for a status the framework itself may answer: its error
 * alone, or, when the route declares that status too, the route's beside
 * it — either of the two as JSON, or each under its own content type.
 */
function withError(
	own: Response | undefined,
	description: string,
	component: string,
): Response {
	if (own === undefined) return errorResponse(description, component);
	const error: JsonSchema = { $ref: `#/components/schemas/${component}` };
	const schema = own.content?.['application/json']?.schema;
	return {
		description: own.description,
		content: {
			...own.content,
			'application/json': {
				schema: schema === undefined ? error : { anyOf: [schema, error] },
			},
		},
	};
}

function errorResponse(description: string, component: string): Response {
	return {
		description,
		content: {
			'application/json': {
				schema: { $ref: `#/components/schemas/${component}` },
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

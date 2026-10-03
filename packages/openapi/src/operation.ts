import type { RouteDefinition } from '@alxia/core';
import { type Converter, toJsonSchema } from './json-schema';
import { operationId } from './naming';
import { parameters } from './parameters';
import { responses } from './responses';
import type { Operation } from './types';

/** A route's operation: its detail, its parameters, its body and its responses. */
export function operation(
	route: RouteDefinition,
	convert?: Converter,
): Operation {
	const { schema, method, path } = route;
	const detail = schema.detail ?? {};
	// The converter runs on the parameters, then the body, then the replies,
	// as it always has: `responses` is called inside the literal, after both.
	const params = parameters(path, schema, convert);
	const body =
		schema.body === undefined
			? undefined
			: toJsonSchema(schema.body, 'input', convert);
	return {
		operationId: detail.operationId ?? operationId(method, path),
		responses: responses(schema, convert, route, route.bodyLimit),
		...(detail.summary === undefined ? {} : { summary: detail.summary }),
		...(detail.description === undefined
			? {}
			: { description: detail.description }),
		...(detail.tags === undefined ? {} : { tags: [...detail.tags] }),
		...(detail.deprecated === undefined
			? {}
			: { deprecated: detail.deprecated }),
		...(params.length > 0 ? { parameters: params } : {}),
		...(body === undefined
			? {}
			: {
					requestBody: {
						required: true,
						content: { 'application/json': { schema: body } },
					},
				}),
	};
}

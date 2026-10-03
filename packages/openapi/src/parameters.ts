import type { RouteSchema, StandardSchemaV1 } from '@alxia/core';
import { type Converter, type JsonSchema, toJsonSchema } from './json-schema';
import type { Parameter } from './types';

/** A route's parameters: its path's, then its query's, headers' and cookies'. */
export function parameters(
	path: string,
	schema: RouteSchema,
	convert?: Converter,
): Parameter[] {
	return [
		...pathParameters(path, schema.params, convert),
		...objectParameters('query', schema.query, convert),
		...objectParameters('header', schema.headers, convert),
		...objectParameters('cookie', schema.cookies, convert),
	];
}

function pathParameters(
	path: string,
	schema: StandardSchemaV1 | undefined,
	convert?: Converter,
): Parameter[] {
	const properties = propertiesOf(schema, convert);
	return path
		.split('/')
		.filter((segment) => segment.startsWith(':') || segment === '*')
		.map((segment) => {
			const name = segment === '*' ? 'path' : segment.slice(1);
			const key = segment === '*' ? '*' : name;
			return {
				name,
				in: 'path',
				required: true,
				schema: properties?.schemas[key] ?? { type: 'string' },
			};
		});
}

function objectParameters(
	location: 'query' | 'header' | 'cookie',
	schema: StandardSchemaV1 | undefined,
	convert?: Converter,
): Parameter[] {
	const properties = propertiesOf(schema, convert);
	if (properties === undefined) return [];
	return Object.entries(properties.schemas).map(([name, property]) => {
		const parameter: Parameter = {
			name,
			in: location,
			required: properties.required.has(name),
			schema: property,
		};
		if (typeof property['description'] === 'string') {
			parameter.description = property['description'];
		}
		return parameter;
	});
}

function propertiesOf(
	schema: StandardSchemaV1 | undefined,
	convert?: Converter,
): { schemas: Record<string, JsonSchema>; required: Set<string> } | undefined {
	if (schema === undefined) return undefined;
	const json = toJsonSchema(schema, 'input', convert);
	const properties = json['properties'];
	if (properties === null || typeof properties !== 'object') return undefined;
	const required = Array.isArray(json['required'])
		? new Set(
				json['required'].filter(
					(key): key is string => typeof key === 'string',
				),
			)
		: new Set<string>();
	return { schemas: properties as Record<string, JsonSchema>, required };
}

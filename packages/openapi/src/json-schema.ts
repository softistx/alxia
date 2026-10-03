import {
	isEventStreamSchema,
	isNamedEventStreamSchema,
	type StandardSchemaV1,
} from '@alxia/core';

export type JsonSchema = Record<string, unknown>;

/** Which side of a schema: what it accepts, or what it gives back. */
export type Side = 'input' | 'output';

/**
 * Turns a schema into JSON Schema, before Standard JSON Schema is tried:
 * for a vendor that does not carry it, or to say more than it does.
 * `undefined` lets the default conversion run. `@alxia/zod` exports one.
 */
export type Converter = (
	schema: StandardSchemaV1,
	side: Side,
) => JsonSchema | undefined;

interface StandardJsonSchema {
	readonly jsonSchema?: {
		readonly input: (options: Record<string, unknown>) => JsonSchema;
		readonly output: (options: Record<string, unknown>) => JsonSchema;
	};
}

/**
 * `schema` as JSON Schema 2020-12, the dialect of OpenAPI 3.1 and 3.2: by
 * `convert`, else through [Standard JSON Schema](https://standardschema.dev),
 * which Zod 4.2 and later, ArkType and Valibot carry. A schema neither
 * converts is documented as `{}`, anything. An event stream is documented
 * by the schema of one event, its `itemSchema`: its data's, or, for named
 * events, one object per name — its `event`, its `data`, its `id`, its `retry`.
 */
export function toJsonSchema(
	schema: StandardSchemaV1,
	side: Side,
	convert?: Converter,
): JsonSchema {
	if (isEventStreamSchema(schema)) {
		return toJsonSchema(schema['~eventStream'], side, convert);
	}
	if (isNamedEventStreamSchema(schema)) {
		return {
			oneOf: Object.entries(schema['~events']).map(([name, data]) => ({
				type: 'object',
				properties: {
					event: { const: name },
					data: toJsonSchema(data, side, convert),
					id: { type: 'string' },
					retry: { type: 'integer', minimum: 0 },
				},
				required: ['event', 'data'],
			})),
		};
	}
	const converted = convert?.(schema, side);
	if (converted !== undefined) return clean(converted);
	const standard = schema['~standard'] as StandardJsonSchema;
	if (standard.jsonSchema === undefined) return {};
	try {
		return clean(standard.jsonSchema[side]({ target: 'draft-2020-12' }));
	} catch {
		return {};
	}
}

function clean(schema: JsonSchema): JsonSchema {
	const { $schema: _, ...rest } = schema;
	return rest;
}

type Side = 'input' | 'output';
type JsonSchema = Record<string, unknown>;

/** What Standard JSON Schema's `input` and `output` take: Zod's `Options`. */
interface JsonSchemaOptions {
	readonly target: string;
	readonly libraryOptions?: Record<string, unknown>;
}

interface ZodLike {
	readonly '~standard': {
		readonly vendor: string;
		readonly jsonSchema?: {
			readonly input: (options: JsonSchemaOptions) => JsonSchema;
			readonly output: (options: JsonSchemaOptions) => JsonSchema;
		};
	};
}

interface ZodContext {
	readonly zodSchema: {
		readonly _zod?: { readonly def?: { readonly type?: string } };
	};
	readonly jsonSchema: JsonSchema;
}

/**
 * A Zod schema as JSON Schema 2020-12, as it crosses the wire: a `Date` is a
 * `date-time` string, a `bigint` an integer, and anything JSON Schema cannot
 * say is documented as anything instead of failing the whole schema.
 *
 * A schema of another vendor gives `undefined`, for the caller's own
 * conversion. `side` is the schema's input, what a client sends, or its
 * output, what a reply holds:
 *
 * ```ts
 * const schema = zodConverter(Todo, 'output'); // { type: 'object', … }
 * ```
 *
 * @deprecated Nothing in alxia reads it any more: it served the `convert`
 * option of the retired `@alxia/openapi` document writer. alxia is OpenAPI
 * spec first, so the schemas come from the document. Zod's own
 * `z.toJSONSchema(schema)` does the same. It stays exported, unchanged, for
 * code that already calls it.
 */
export function zodConverter(
	schema: ZodLike,
	side: Side,
): JsonSchema | undefined {
	const standard = schema['~standard'];
	if (standard.vendor !== 'zod' || standard.jsonSchema === undefined) {
		return undefined;
	}
	return standard.jsonSchema[side]({
		target: 'draft-2020-12',
		libraryOptions: {
			unrepresentable: 'any',
			override: (ctx: ZodContext) => {
				const type = ctx.zodSchema._zod?.def?.type;
				if (type === 'date') {
					ctx.jsonSchema['type'] = 'string';
					ctx.jsonSchema['format'] = 'date-time';
				} else if (type === 'bigint') {
					ctx.jsonSchema['type'] = 'integer';
				}
			},
		},
	});
}

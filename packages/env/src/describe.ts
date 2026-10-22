/**
 * What a variable's schema tells about it, best effort: Zod, Valibot and
 * ArkType are read through their own shapes. A schema none of them fits, or
 * that gives no description, is read through its Standard JSON Schema form
 * (`~standard.jsonSchema.input`, when it has one); otherwise it is simply not
 * described.
 */
import type { StandardSchema } from './standard';

type Any = any;

const WRAPPERS = new Set([
	'default',
	'prefault',
	'optional',
	'nullable',
	'nonoptional',
	'readonly',
	'catch',
	'exactOptional',
	'nullish',
	'undefinedable',
]);

const list = (values: readonly unknown[]): string =>
	values.map((value) => JSON.stringify(value)).join(' | ');

function zodType(def: Any): string | undefined {
	if (WRAPPERS.has(def.type)) return expectedOf(def.innerType);
	switch (def.type) {
		case 'pipe':
			return expectedOf(def.in);
		case 'enum':
			return list(Object.values(def.entries));
		case 'literal':
			return list(def.values);
		case 'string':
			return def.format === undefined ? 'string' : `string (${def.format})`;
		default:
			return def.type;
	}
}

function valibotType(schema: Any): string | undefined {
	if (WRAPPERS.has(schema.type)) return expectedOf(schema.wrapped);
	if (schema.type === 'picklist') return list(schema.options);
	if (schema.type === 'literal') return list([schema.literal]);
	return schema.type;
}

/** The JSON Schema the schema's Standard JSON Schema form gives, if any. */
function jsonSchemaOf(schema: StandardSchema<unknown>): Any {
	try {
		const form = (schema as Any)?.['~standard']?.jsonSchema;
		if (typeof form?.input !== 'function') return undefined;
		const json = form.input({ target: 'draft-2020-12' });
		return typeof json === 'object' && json !== null ? json : undefined;
	} catch {
		return undefined; // a form that cannot express this schema: absent
	}
}

function jsonType(json: Any): string | undefined {
	if (Array.isArray(json.enum)) return list(json.enum);
	if (json.const !== undefined) return list([json.const]);
	const alternatives = json.anyOf ?? json.oneOf;
	if (Array.isArray(alternatives)) {
		const types = alternatives.map((one: Any) => jsonType(one));
		return types.every((one: unknown) => typeof one === 'string')
			? types.join(' | ')
			: undefined;
	}
	if (Array.isArray(json.type)) return json.type.join(' | ');
	if (typeof json.type !== 'string') return undefined;
	return typeof json.format === 'string' && json.type === 'string'
		? `string (${json.format})`
		: json.type;
}

/** The type a variable is expected to be: `number`, `string (url)`, `"a" | "b"`. */
export function expectedOf(
	schema: StandardSchema<unknown>,
): string | undefined {
	return shapeType(schema) ?? jsonType(jsonSchemaOf(schema) ?? {});
}

function shapeType(schema: StandardSchema<unknown>): string | undefined {
	const any = schema as Any;
	try {
		if (any?.['~standard']?.vendor === 'arktype') return any.expression;
		if (any?._zod?.def !== undefined) return zodType(any._zod.def);
		if (any?.['~standard']?.vendor === 'valibot') return valibotType(any);
	} catch {
		// a validator that changed its internals: not described
	}
	return undefined;
}

/** What `.describe()` (Zod) or `v.description()` (Valibot) wrote, else the JSON Schema's. */
export function descriptionOf(
	schema: StandardSchema<unknown>,
): string | undefined {
	const described = shapeDescription(schema);
	if (described !== undefined) return described;
	const json = jsonSchemaOf(schema);
	return typeof json?.description === 'string' ? json.description : undefined;
}

function shapeDescription(schema: StandardSchema<unknown>): string | undefined {
	const any = schema as Any;
	try {
		if (typeof any.description === 'string') return any.description;
		const piped = any.pipe?.find?.(
			(action: Any) => action.type === 'description',
		);
		if (typeof piped?.description === 'string') return piped.description;
		const inner = any._zod?.def?.innerType ?? any.wrapped;
		return inner === undefined ? undefined : shapeDescription(inner);
	} catch {
		return undefined;
	}
}

/**
 * What a variable's schema tells about it, best effort: Standard Schema
 * carries no description, so each validator is read through its own shape,
 * and a schema none of them fits is simply not described.
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

/** The type a variable is expected to be: `number`, `string (url)`, `"a" | "b"`. */
export function expectedOf(
	schema: StandardSchema<unknown>,
): string | undefined {
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

/** What `.describe()` (Zod) or `v.description()` (Valibot) wrote, if anything. */
export function descriptionOf(
	schema: StandardSchema<unknown>,
): string | undefined {
	const any = schema as Any;
	try {
		if (typeof any.description === 'string') return any.description;
		const piped = any.pipe?.find?.(
			(action: Any) => action.type === 'description',
		);
		if (typeof piped?.description === 'string') return piped.description;
		const inner = any._zod?.def?.innerType ?? any.wrapped;
		return inner === undefined ? undefined : descriptionOf(inner);
	} catch {
		return undefined;
	}
}

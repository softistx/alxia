import type { Catalogues } from './types';

/**
 * Whether `catalogue` has a message at the dotted `key`: the lookup
 * `@nxgt/i18n`'s translator makes, a string — a number or a section of
 * messages is not one, and `@nxgt/i18n` 3 would answer it from its own
 * fallback language — so that a language which lacks a key can be told from one whose
 * message happens to be the key itself. A key is a dotted path, or a flat
 * key of the catalogue; bracket paths (`a[0]`) are not supported, unlike
 * lodash's `_.get`.
 */
export function has(
	catalogue: Readonly<Record<string, unknown>> | undefined,
	key: string,
): boolean {
	if (catalogue === undefined) return false;
	// A flat key, `'home.title': …`, comes before the path, as in lodash's `get`.
	if (Object.hasOwn(catalogue, key)) return typeof catalogue[key] === 'string';
	let at: unknown = catalogue;
	for (const part of key.split('.')) {
		if (typeof at !== 'object' || at === null) return false;
		if (!Object.hasOwn(at, part)) return false;
		at = (at as Record<string, unknown>)[part];
	}
	return typeof at === 'string';
}

/** The first language of `chain` whose catalogue has `key`. */
export function holder(
	resources: Catalogues,
	chain: readonly string[],
	key: string,
): string | undefined {
	return chain.find((language) =>
		has(
			Object.hasOwn(resources, language) ? resources[language] : undefined,
			key,
		),
	);
}

/** `steps` in order, each once. */
export function unique(...steps: readonly string[]): string[] {
	return [...new Set(steps)];
}

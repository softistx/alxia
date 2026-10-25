/**
 * Base languages written right to left. A fixed list: a language is added
 * here when it needs it.
 */
const RTL = new Set([
	'ar',
	'fa',
	'he',
	'ur',
	'ps',
	'yi',
	'dv',
	'ckb',
	'sd',
	'ug',
	// Legacy codes of Hebrew and Yiddish.
	'iw',
	'ji',
]);

/**
 * The `dir` of a language tag: `'rtl'` for a right-to-left base language,
 * `'ltr'` for the rest. The base tag is read whatever its case, so `ar-EG`
 * and `AR` are `'rtl'` and `en-US` is `'ltr'`.
 *
 * Known gap: a script subtag is not read, so `az-Arab` (Azerbaijani in the
 * Arabic script) is `'ltr'`, as `az` is.
 */
export function textDirection(language: string): 'ltr' | 'rtl' {
	const base = language.split(/[-_]/, 1)[0]?.toLowerCase() ?? '';
	return RTL.has(base) ? 'rtl' : 'ltr';
}

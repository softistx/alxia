/**
 * The tag every kept response carries for its path — `/users/1?x=y`, as the
 * request asked it — and what `invalidate(path)` forgets. Tags starting
 * `alxia:` are the plugin's own. Exported for a store, or a job, that
 * forgets a path without the `Cache` at hand: `store.deleteTag(pathTag(p))`.
 */
export const pathTag = (path: string): string => `alxia:path:${path}`;

/** The default key: the path and query, then each varying header's value. */
export function defaultKey(
	path: string,
	vary: readonly string[],
	headers: Headers,
): string {
	if (vary.length === 0) return path;
	return `${path}|${vary.map((name) => `${name}=${headers.get(name) ?? ''}`).join('|')}`;
}

/**
 * What a route's handler is, when core made it: a directory's files or a
 * file, which the route table marks. Kept beside the handler, never on it.
 */
const KINDS = new WeakMap<object, 'static' | 'file'>();

/** Marks `handler` as `app.static`'s or `app.file`'s, and returns it. */
export function markKind<Handler extends object>(
	handler: Handler,
	kind: 'static' | 'file',
): Handler {
	KINDS.set(handler, kind);
	return handler;
}

/** `static` or `file` for a handler `markKind` marked, else nothing. */
export function kindOf(handler: object): 'static' | 'file' | undefined {
	return KINDS.get(handler);
}

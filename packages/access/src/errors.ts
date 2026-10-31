export type AccessCatalogueErrorCode =
	| 'access.invalid-permission'
	| 'access.unknown-role'
	| 'access.undeclared-grant';

/**
 * The catalogue cannot be built from the modules; the message names the
 * module. `code` is stable and namespaced `access.`. (A permission two modules
 * declare is a `ModuleGraphError` of `@alxia/modules`.)
 */
export class AccessCatalogueError extends Error {
	constructor(
		readonly code: AccessCatalogueErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'AccessCatalogueError';
	}
}

export type AccessErrorCode =
	| 'auth.errors.unauthenticated'
	| 'auth.errors.forbidden';

/**
 * A refusal of a guard: a stable `code` to translate, the HTTP `status` to
 * answer with and the `params` the message needs. The host maps it to its own
 * error type (`refusalMapper`); nothing here knows how it reaches the client.
 */
export class AccessError extends Error {
	constructor(
		readonly code: AccessErrorCode,
		readonly status: 401 | 403,
		readonly params: Readonly<Record<string, string>> = {},
	) {
		super(code);
		this.name = 'AccessError';
	}
}

export const unauthenticated = () =>
	new AccessError('auth.errors.unauthenticated', 401);

export const forbidden = (permission: string) =>
	new AccessError('auth.errors.forbidden', 403, { permission });

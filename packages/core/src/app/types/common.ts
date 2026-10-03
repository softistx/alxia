/** The methods a route may answer. */
export type Method =
	| 'GET'
	| 'POST'
	| 'PUT'
	| 'PATCH'
	| 'DELETE'
	| 'OPTIONS'
	| 'HEAD'
	| 'QUERY';

/** No properties: the identity of `&`. */
export type Empty = Record<never, never>;

export type MaybePromise<Value> = Value | Promise<Value>;

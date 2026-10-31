/** `<area>:read` or `<area>:manage`: `notes:read` reads, `notes:manage` changes. */
export type Permission = `${string}:read` | `${string}:manage`;

// The area is lower case, digits and `_`; the action is `read` or `manage`.
const PERMISSION = /^[a-z][a-z0-9_]*:(read|manage)$/;

export const isPermission = (value: unknown): value is Permission =>
	typeof value === 'string' && PERMISSION.test(value);

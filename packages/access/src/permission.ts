/**
 * `<area>:<action>`: `notes:read` reads, `notes:manage` changes, and an action
 * the host declares through `createAccess`' `actions` (`orders:receive`) does
 * something narrower. The action is `string` here because the host's list is a
 * runtime value; `createAccess` refuses, at boot, one that is not declared.
 */
export type Permission = `${string}:${string}`;

// The area and the action are lower case, digits and `_`.
const SHAPE = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;
const NAME = /^[a-z][a-z0-9_]*$/;

/** Whether `value` is a valid action name (lower case, digits and `_`). */
export const isActionName = (value: unknown): value is string =>
	typeof value === 'string' && NAME.test(value);

/**
 * Whether `value` is `<area>:read`, `<area>:manage` or `<area>:<action>` for
 * an action in `actions` (the host's extra ones, none by default).
 */
export const isPermission = (
	value: unknown,
	actions: readonly string[] = [],
): value is Permission => {
	if (typeof value !== 'string' || !SHAPE.test(value)) return false;
	const action = value.slice(value.indexOf(':') + 1);
	return action === 'read' || action === 'manage' || actions.includes(action);
};

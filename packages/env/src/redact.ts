import { inspect } from 'node:util';

export const REDACTED = '***';

/**
 * The values, their secrets hidden wherever `env` is printed: `toJSON`
 * (`JSON.stringify`, the logger), `inspect` (`console.log`) and `toString`.
 * They are not enumerable, so `toEqual` and `Object.keys` do not see them;
 * a spread (`{ ...env }`) is a copy that holds the real values.
 */
export function printable<T extends object>(
	values: T,
	secret: ReadonlySet<string>,
): T {
	const hidden = (): Record<string, unknown> =>
		Object.fromEntries(
			Object.entries(values).map(([name, value]) => [
				name,
				secret.has(name) ? REDACTED : value,
			]),
		);
	const print = (_depth?: unknown, options?: object): string =>
		inspect(hidden(), options);
	Object.defineProperties(values, {
		toJSON: { value: hidden },
		toString: { value: () => print() },
		[Symbol.for('nodejs.util.inspect.custom')]: { value: print },
	});
	return Object.freeze(values);
}

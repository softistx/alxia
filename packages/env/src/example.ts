import { descriptionOf, expectedOf } from './describe';
import { described } from './registry';

const quoted = (value: string): string =>
	/[\s#"'$\\]/.test(value) ? JSON.stringify(value) : value;

/**
 * A `.env.example` from the schema `defineEnv` was given: each variable's
 * description and expected type, whether it is required, and its default —
 * never a secret's. A variable with no default is left empty, an optional
 * one commented out.
 *
 * ```ts
 * expect(envExample(env)).toBe(await Bun.file('.env.example').text()); // no drift
 * ```
 */
export function envExample(env: object): string {
	const found = described.get(env);
	if (found === undefined) {
		throw new TypeError('envExample(): not an env made by defineEnv()');
	}
	const blocks = Object.entries(found.shape).map(([name, schema]) => {
		const result = schema['~standard'].validate(undefined);
		const settled = result instanceof Promise || result.issues !== undefined;
		const fallback = settled ? undefined : (result as { value: unknown }).value;
		const secret = found.secret.has(name);
		const shown =
			!secret && ['string', 'number', 'boolean'].includes(typeof fallback)
				? String(fallback)
				: undefined;
		const required = settled;
		const notes = [
			expectedOf(schema),
			required ? 'required' : 'optional',
			shown === undefined ? undefined : `default ${shown}`,
			secret ? 'secret' : undefined,
		].filter((note) => note !== undefined);
		const description = descriptionOf(schema);
		const assignment = `${name}=${shown === undefined ? '' : quoted(shown)}`;
		return [
			...(description === undefined ? [] : [`# ${description}`]),
			`# ${notes.join(', ')}`,
			required || fallback !== undefined ? assignment : `# ${assignment}`,
		].join('\n');
	});
	return `${blocks.join('\n\n')}\n`;
}

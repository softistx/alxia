/** What the copy and template specs share: the ranges they copy with, and a template's stored files. */
import { join } from 'node:path';
import { TEMPLATES } from '../src/copy';

/** The ranges the specs copy `@alxia/*` with. */
export const ALXIA = {
	'@alxia/core': '^0.3.0',
	'@alxia/env': '^0.1.0',
	'@alxia/graphql': '^0.2.0',
	'@alxia/openapi': '^0.4.0',
	'@alxia/react-router': '^0.2.0',
};

/** Every file a template stores, by its path under `templates/<name>/`. */
export const storedPaths = (name: string) =>
	Array.fromAsync(
		new Bun.Glob('**').scan({ cwd: join(TEMPLATES, name), dot: true }),
	).then((paths) => paths.filter((path) => !path.endsWith('.DS_Store')));

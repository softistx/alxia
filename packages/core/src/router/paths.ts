import type { JoinPath } from '../types/path';
import { compilePath } from './compile';

/**
 * `prefix` then `path`, as the app joins them: a prefix, a group, a plugin
 * given to `use`. `/` under `/api` is `/api`, and an empty prefix leaves the
 * path as it is. `JoinPath` is its type. It checks neither argument: the
 * app refuses a prefix or a path that is not absolute when it is given.
 *
 * ```ts
 * joinPath('/api', '/pets'); // '/api/pets'
 * joinPath('/api', '/'); // '/api'
 * joinPath('', '/pets'); // '/pets'
 * ```
 */
export function joinPath<Prefix extends string, Path extends string>(
	prefix: Prefix,
	path: Path,
): JoinPath<Prefix, Path> {
	if (prefix === '') return path as JoinPath<Prefix, Path>;
	return (path === '/' ? prefix : `${prefix}${path}`) as JoinPath<Prefix, Path>;
}

/**
 * The path with every parameter name erased: two paths of one shape match
 * the same requests, and the router refuses the second. Only a whole `:name`
 * segment is a parameter, so `/at/10:30` is a literal path.
 *
 * ```ts
 * shapeOf('/pets/:id'); // '/pets/:'
 * shapeOf('/pets/:id') === shapeOf('/pets/:petId'); // true
 * shapeOf('/files/*'); // '/files/*'
 * ```
 *
 * Throws a `TypeError`, as declaring a route there would, for a path that
 * does not start with `/`, a `*` that does not end it, a `:name` that is not
 * an identifier, or a name declared twice.
 */
export function shapeOf(path: string): string {
	return compilePath(path).shape;
}

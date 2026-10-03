import type { Method } from '@alxia/core';

/** `/users/:id/*` as OpenAPI writes it, `/users/{id}/{path}`. */
export function openApiPath(path: string): string {
	return path
		.split('/')
		.map((segment) =>
			segment === '*'
				? '{path}'
				: segment.startsWith(':')
					? `{${segment.slice(1)}}`
					: segment,
		)
		.join('/');
}

/** `GET /users/:id` as an operation id, `getUsersById`, unless the route names its own. */
export function operationId(method: Method, path: string): string {
	const words = path
		.split('/')
		.filter(Boolean)
		.map((segment) =>
			segment === '*'
				? 'Path'
				: segment.startsWith(':')
					? `By${capitalize(segment.slice(1))}`
					: segment
							.split(/[^A-Za-z0-9]+/)
							.filter(Boolean)
							.map(capitalize)
							.join(''),
		);
	return method.toLowerCase() + words.join('');
}

function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

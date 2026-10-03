import type { Method, RouteDefinition } from '@alxia/core';
import { COMPONENTS } from './components';
import { openApiPath } from './naming';
import { operation } from './operation';
import type { OpenApiDocument, OpenApiOptions } from './types';

// The spec reads the names from here, where the document is made.
export { openApiPath, operationId } from './naming';

/**
 * The OpenAPI 3.2 document of an app's routes. Every route is documented as
 * it runs: its 400 when it validates its request, the 500 any route may
 * answer, and each reply its schema declares.
 *
 * ```ts
 * const document = openapi(app, { info: { title: 'Users', version: '1.0.0' } });
 * ```
 */
export function openapi(
	app: { readonly routes: readonly RouteDefinition[] },
	options: OpenApiOptions,
): OpenApiDocument {
	const paths: OpenApiDocument['paths'] = {};
	for (const route of app.routes) {
		if (options.exclude?.(route)) continue;
		const path = openApiPath(route.path);
		paths[path] ??= {};
		const methodKey = route.method.toLowerCase() as Lowercase<Method>;
		paths[path][methodKey] = operation(route, options.convert);
	}
	return {
		openapi: '3.2.0',
		info: options.info,
		...(options.servers === undefined ? {} : { servers: options.servers }),
		paths,
		components: { schemas: COMPONENTS },
	};
}

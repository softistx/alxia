/**
 * The route table `listen` prints in dev: the URL it listens on, then a
 * line per route — its method, its path, the names of its middlewares,
 * what its handler is — sockets, directories, files and pages marked.
 */
import type { ChainHook, Definition, Runtime } from '../app/definition';
import { kindOf } from './kinds';

/** A route as the table shows it. */
export interface RouteRow {
	/** `GET`, `POST`, …, `WS` for a socket route, `PAGE` for an HTML page Bun serves. */
	readonly method: string;
	/** Its full path, as declared. */
	readonly path: string;
	/** The names of its middlewares, in the order they run: `anonymous` for one that has none. */
	readonly middlewares: readonly string[];
	/** `ws`, `static`, `file` or `page`; else its handler's name, if it has one. */
	readonly handler?: string;
}

/** Every route of the app, in the order declared, then its pages. */
export function routeRows(runtime: Runtime): RouteRow[] {
	const rows: RouteRow[] = [];
	for (const [path, methods] of runtime.router.paths()) {
		for (const [method, definition] of methods) {
			rows.push(rowOf(method, path, definition));
		}
	}
	for (const path of runtime.globals.pages.keys()) {
		rows.push({ method: 'PAGE', path, middlewares: [], handler: 'page' });
	}
	return rows;
}

function rowOf(method: string, path: string, definition: Definition): RouteRow {
	const middlewares = definition.derive.flatMap(nameOf);
	if (definition.kind === 'ws') {
		return { method, path, middlewares, handler: 'ws' };
	}
	const handler = kindOf(definition.handler) ?? definition.handler.name;
	return handler === '' || handler === 'handler'
		? { method, path, middlewares }
		: { method, path, middlewares, handler };
}

/** A step's name in the table: a `derive` or a `decorate` is none, the app's context. */
function nameOf(hook: ChainHook): string[] {
	switch (hook.kind) {
		case 'derive':
			return [];
		case 'middleware':
			return [hook.run.name === '' ? 'anonymous' : hook.run.name];
		default:
			return [hook.kind];
	}
}

/**
 * The table, as `listen` prints it:
 *
 * ```text
 * alxia listening on http://localhost:3000/ (dev)
 *   GET   /todos      logger › auth → listTodos
 *   POST  /graphql    logger › auth → graphql
 *   WS    /chat       auth [ws]
 *   GET   /assets/*   [static]
 * ```
 */
export function formatRoutes(
	url: URL | string,
	rows: readonly RouteRow[],
	dev = true,
): string {
	const method = Math.max(0, ...rows.map((row) => row.method.length));
	const path = Math.max(0, ...rows.map((row) => row.path.length));
	const lines = rows.map((row) => {
		const chain = row.middlewares.join(' › ');
		const tail = row.handler === undefined ? '' : handlerText(row.handler);
		const rest = [chain, tail].filter((part) => part !== '').join(' ');
		return `  ${row.method.padEnd(method)}  ${row.path.padEnd(path)}  ${rest}`.trimEnd();
	});
	const head = `alxia listening on ${String(url)}${dev ? ' (dev)' : ''}`;
	return rows.length === 0
		? `${head}\n  no route declared`
		: [head, ...lines].join('\n');
}

const MARKS = new Set(['ws', 'static', 'file', 'page']);

function handlerText(handler: string): string {
	return MARKS.has(handler) ? `[${handler}]` : `→ ${handler}`;
}

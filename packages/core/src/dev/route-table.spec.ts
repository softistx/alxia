/**
 * The route table `listen` prints in dev: the URL, each route's method,
 * path, middlewares and handler, sockets, directories, files and pages
 * marked; `onListen` told instead, in every mode; nothing outside dev.
 */
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '../app/alxia';
import type { ListenInfo } from '../app/signatures';
import { validate } from '../app/validate';
import { health } from '../health/health';
import { formatRoutes } from './route-table';

const auth = function auth(
	_ctx: object,
	next: (added: object) => Promise<Response>,
) {
	return next({ user: 'ada' });
};

const app = (dev: boolean) =>
	alxia({ dev })
		.use(function logger(_ctx, next) {
			return next();
		})
		.plugin(health())
		.get('/todos', auth, function listTodos({ reply }) {
			return reply(200, []);
		})
		.post('/todos', validate({ body: { '~standard': ok } }), ({ reply }) =>
			reply(201),
		)
		.ws('/chat', auth, { message: () => {} })
		.static('/assets', import.meta.dir)
		.file('/robots.txt', Bun.file(import.meta.path));

const ok = {
	version: 1 as const,
	vendor: 'test',
	validate: (value: unknown) => ({ value }),
};

let stops: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const stop of stops) await stop();
	stops = [];
});

function listen(served: ReturnType<typeof app>, onListen?: ListenOptions) {
	served.listen({ port: 0, signals: false, ...onListen });
	stops.push(() => served.stop(true));
}
type ListenOptions = { onListen?: (info: ListenInfo) => void };

describe('the route table', () => {
	test("printed in dev once the app listens: every route, in the order declared, a path's methods together", () => {
		const log = spyOn(console, 'log').mockImplementation(() => {});
		try {
			listen(app(true));
			expect(log).toHaveBeenCalledTimes(1);
			const table = String(log.mock.calls[0]?.[0]);
			const [head, ...lines] = table.split('\n');
			expect(head).toMatch(
				/^alxia listening on http:\/\/localhost:\d+\/ \(dev\)$/,
			);
			expect(lines).toEqual([
				'  GET   /health      logger',
				'  GET   /ready       logger',
				'  GET   /todos       logger › auth → listTodos',
				'  POST  /todos       logger › validate',
				'  WS    /chat        logger › auth [ws]',
				'  GET   /assets/*    logger [static]',
				'  GET   /robots.txt  logger [file]',
			]);
		} finally {
			log.mockRestore();
		}
	});

	test('nothing printed outside dev', () => {
		const log = spyOn(console, 'log').mockImplementation(() => {});
		try {
			listen(app(false));
			expect(log).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	test('onListen is told the URL, the routes and the table, in every mode, and nothing is printed', () => {
		const log = spyOn(console, 'log').mockImplementation(() => {});
		try {
			for (const dev of [true, false]) {
				const told: ListenInfo[] = [];
				listen(app(dev), { onListen: (info) => told.push(info) });
				expect(told).toHaveLength(1);
				const [info] = told as [ListenInfo];
				expect(info.url).toBeInstanceOf(URL);
				expect(info.server.port).toBe(Number(info.url.port));
				expect(info.routes[2]).toEqual({
					method: 'GET',
					path: '/todos',
					middlewares: ['logger', 'auth'],
					handler: 'listTodos',
				});
				expect(info.routes[4]).toMatchObject({ method: 'WS', handler: 'ws' });
				expect(info.table).toContain('/todos');
				// The table's head says dev only in dev.
				expect(info.table.split('\n')[0]?.endsWith(' (dev)')).toBe(dev);
			}
			expect(log).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	test('an onListen that throws is logged, and the server listens', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const served = app(false);
			listen(served, {
				onListen: () => {
					throw new Error('no logger');
				},
			});
			expect(error).toHaveBeenCalledTimes(1);
			const response = await fetch(new URL('/todos', served.server?.url));
			expect(response.status).toBe(200);
		} finally {
			error.mockRestore();
		}
	});

	test('pages, anonymous middlewares, and an app with no route', () => {
		expect(
			formatRoutes('http://localhost:3000/', [
				{ method: 'GET', path: '/', middlewares: ['anonymous'] },
				{ method: 'PAGE', path: '/about', middlewares: [], handler: 'page' },
			]),
		).toBe(
			[
				'alxia listening on http://localhost:3000/ (dev)',
				'  GET   /       anonymous',
				'  PAGE  /about  [page]',
			].join('\n'),
		);
		expect(formatRoutes('http://localhost:3000/', [])).toBe(
			'alxia listening on http://localhost:3000/ (dev)\n  no route declared',
		);
	});
});

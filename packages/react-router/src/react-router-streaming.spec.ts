import { describe, expect, test } from 'bun:test';
import { compress } from '@alxia/compress';
import { reactRouter } from '@alxia/react-router';
import { makeBase } from '../fixture/base';
import { BROWSER } from '../test/fixture';
import { build, loadBuild, served } from '../test/react-router-helpers';

loadBuild();

describe('streaming', () => {
	/** The first chunk of `/slow`, and the whole page, read off a real server. */
	async function slow(
		app: { listen(options: { port: number }): Bun.Server<unknown> },
		encoding: string,
	) {
		const server = app.listen({ port: 0 });
		try {
			const started = performance.now();
			const response = await fetch(new URL('/slow', server.url), {
				headers: { 'user-agent': BROWSER, 'accept-encoding': encoding },
			});
			const reader = (response.body as ReadableStream<Uint8Array>).getReader();
			const decoder = new TextDecoder();
			let first: { at: number; text: string } | undefined;
			let all = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				first ??= { at: performance.now() - started, text: chunk };
				all += chunk;
			}
			return {
				encoding: response.headers.get('content-encoding'),
				first,
				all,
				ended: performance.now() - started,
			};
		} finally {
			server.stop(true);
		}
	}

	/** The shell and its fallback first, the deferred value 600 ms later. */
	function expectStreamed({
		first,
		all,
		ended,
	}: Awaited<ReturnType<typeof slow>>) {
		expect(first?.text).toContain('immediate-value');
		expect(first?.text).toContain('id="fallback"');
		expect(first?.text).not.toContain('deferred-value');
		expect(all).toContain('deferred-value');
		expect(first?.at ?? Infinity).toBeLessThan(ended - 300);
	}

	test('the shell arrives before the deferred value', async () => {
		expectStreamed(await slow(served(), 'identity'));
	});

	test.each(['gzip', 'br', 'zstd'])(
		'and still does behind @alxia/compress, in %s',
		async (encoding) => {
			const app = makeBase()
				.use(compress())
				.plugin((app) => reactRouter(app, { build }));
			const result = await slow(app, encoding);
			expect(result.encoding).toBe(encoding);
			expectStreamed(result);
		},
	);
});

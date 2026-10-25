import { describe, expect, test } from 'bun:test';
import { reactRouter } from '@alxia/react-router';
import { createEntry } from '@alxia/react-router/entry';
import type { ServerBuild } from 'react-router';
import { makeBase } from '../../fixture/base';
import { BROWSER, browser } from '../../test/fixture';
import { build, loadBuild } from '../../test/react-router-helpers';

loadBuild();

const NONCE = 'ZW50cnktc3BlYy1ub25jZQ';
const BOT =
	'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The fixture served with a nonce on its context, and `served` as its build. */
const app = (served: ServerBuild = build) =>
	makeBase()
		.derive(() => ({ nonce: NONCE }))
		.plugin((base) => reactRouter(base, { build: served }));

/** The first chunk of a response body, and the whole of it. */
async function chunks(response: Response) {
	const reader = (response.body as ReadableStream<Uint8Array>).getReader();
	const decoder = new TextDecoder();
	const first = decoder.decode((await reader.read()).value);
	let all = first;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		all += decoder.decode(value, { stream: true });
	}
	return { first, all };
}

describe('the package entry, on the fixture', () => {
	test('answers HEAD with the status and no body', async () => {
		for (const [path, status] of [
			['/', 200],
			['/boom', 500],
		] as const) {
			const response = await app().request(path, {
				method: 'HEAD',
				headers: browser,
			});
			expect(response.status).toBe(status);
			expect(response.headers.get('content-type')).toContain('text/html');
			expect(await response.text()).toBe('');
		}
	});

	test('streams the shell for a browser', async () => {
		const response = await app().request('/slow', { headers: browser });
		expect(response.status).toBe(200);
		const { first, all } = await chunks(response);
		expect(first).toContain('immediate-value');
		expect(first).toContain('id="fallback"');
		expect(first).not.toContain('deferred-value');
		expect(all).toContain('deferred-value');
	});

	test('gives a bot the whole page in one piece', async () => {
		const response = await app().request('/slow', {
			headers: { 'user-agent': BOT },
		});
		const { first } = await chunks(response);
		expect(first).toContain('deferred-value');
		expect(first).not.toContain('id="fallback"');
	});

	test('answers 500 for a route that throws', async () => {
		const response = await app().request('/boom', { headers: browser });
		expect(response.status).toBe(500);
		expect(await response.text()).toContain('<h1>Oops</h1>');
	});

	test("the inline script and the meta carry the context's nonce", async () => {
		const html = await (await app().request('/', { headers: browser })).text();
		expect(html).toContain(
			`<script nonce="${NONCE}">document.documentElement.dataset.booted='1'</script>`,
		);
		expect(html).toContain(`<meta property="csp-nonce" nonce="${NONCE}"/>`);
		for (const script of html.match(/<script\b[^>]*>/g) ?? []) {
			expect(script).toContain(`nonce="${NONCE}"`);
		}
	});

	test('renders no nonce without one on the context', async () => {
		const response = await makeBase()
			.plugin((base) => reactRouter(base, { build }))
			.request('/', { headers: browser });
		const html = await response.text();
		expect(html).toContain('<meta property="csp-nonce"/>');
		expect(html).not.toContain('nonce="');
	});

	test('the nonce option overrides nonceOf', async () => {
		const entry = createEntry({ nonce: () => 'from-the-option' });
		const own: ServerBuild = {
			...build,
			entry: {
				...build.entry,
				module: { ...build.entry.module, default: entry.handleRequest },
			},
		};
		const html = await (
			await app(own).request('/', { headers: { 'user-agent': BROWSER } })
		).text();
		expect(html).toContain(
			'<meta property="csp-nonce" nonce="from-the-option"/>',
		);
		expect(html).not.toContain(NONCE);
	});

	/** The fixture served through an entry made with `options`. */
	const through = (options: Parameters<typeof createEntry>[0]) => {
		const entry = createEntry(options);
		const own: ServerBuild = {
			...build,
			entry: {
				...build.entry,
				module: { ...build.entry.module, default: entry.handleRequest },
			},
		};
		return { entry, served: app(own) };
	};

	test('isBot and onError are options', async () => {
		const errors: unknown[] = [];
		const { entry, served } = through({
			isBot: () => true,
			onError: (error) => errors.push(error),
		});
		// A bot gets the whole page at once, deferred value included.
		const response = await served.request('/slow', { headers: browser });
		expect((await chunks(response)).first).toContain('deferred-value');
		expect(errors).toEqual([]);
		expect(entry.streamTimeout).toBe(5_000);
	});

	test('streamTimeout is an option, read back from the entry', () => {
		expect(createEntry({ streamTimeout: 8_000 }).streamTimeout).toBe(8_000);
	});

	test('an error under a Suspense, after the shell, is reported to onError', async () => {
		const errors: unknown[] = [];
		const { served } = through({ onError: (error) => errors.push(error) });
		const response = await served.request('/late-boom', { headers: browser });
		expect((await chunks(response)).all).toContain('shell');
		expect(errors.map(String).join()).toContain('the suspended part exploded');
	});

	test('an error in the shell rejects handleRequest, and is not reported to onError', async () => {
		const errors: unknown[] = [];
		const { entry } = through({ onError: (error) => errors.push(error) });
		const router = {
			isSpaMode: false,
			staticHandlerContext: {
				loaderData: {},
				errors: null,
				matches: [],
			},
		};
		await expect(
			entry.handleRequest(
				new Request('http://localhost/shell-boom', { headers: browser }),
				200,
				new Headers(),
				router as never,
				undefined as never,
			),
		).rejects.toThrow();
		expect(errors).toEqual([]);
	});
});

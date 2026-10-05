import { describe, expect, test } from 'bun:test';
import { browser, text } from '../test/fixture';
import { build, loadBuild, served } from '../test/react-router-helpers';

loadBuild();

describe('pages', () => {
	test('a document is server rendered, its loader reading what the middlewares built', async () => {
		const response = await served().request('/', {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html');
		const html = text(await response.text());
		expect(html).toContain('<h1>Hello Ada</h1>');
		expect(html).toContain('<p id="route">/*</p>');
	});

	test('a single-fetch data request reads the same context', async () => {
		const response = await served().request('/_.data', {
			headers: { ...browser, 'x-user': 'Bob' },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/x-script');
		expect(await response.text()).toContain('"Bob"');
	});

	test("an index route's document action is POST /?index", async () => {
		const response = await served().request('/?index', {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ step: '2' }),
		});
		expect(response.status).toBe(200);
		expect(text(await response.text())).toContain('<p id="added">added 2</p>');
	});

	test('POST / is React Router’s 405: the root has no action', async () => {
		const response = await served().request('/', {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ step: '2' }),
		});
		expect(response.status).toBe(405);
	});

	test('a single-fetch action answers its data', async () => {
		const response = await served().request('/_.data?index', {
			method: 'POST',
			headers: { ...browser, 'x-user': 'Cy' },
			body: new URLSearchParams({ step: '3' }),
		});
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('"added",3');
		expect(body).toContain('"Cy"');
	});

	test('a redirect keeps both of its cookies', async () => {
		const response = await served().request('/login', {
			method: 'POST',
			headers: browser,
			redirect: 'manual',
		});
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/');
		expect(response.headers.getSetCookie()).toEqual([
			'a=1; Path=/; HttpOnly',
			'b=2; Path=/; HttpOnly',
		]);
	});

	test('a single-fetch redirect keeps them too', async () => {
		const response = await served().request('/login.data', {
			method: 'POST',
			headers: browser,
		});
		expect(response.status).toBe(202);
		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(await response.text()).toContain('"redirect","/"');
	});

	test('a thrown 404 and a route that does not exist are 404 pages', async () => {
		const app = served();
		const thrown = await app.request('/missing', { headers: browser });
		expect(thrown.status).toBe(404);
		expect(text(await thrown.text())).toContain('404 no such thing');
		const nowhere = await app.request('/nowhere', { headers: browser });
		expect(nowhere.status).toBe(404);
		expect(nowhere.headers.get('content-type')).toBe('text/html');
	});

	test('a loader that throws is a 500 page', async () => {
		const response = await served().request('/boom', { headers: browser });
		expect(response.status).toBe(500);
		expect(await response.text()).toContain('<h1>Oops</h1>');
	});

	test('lazy route discovery: /__manifest', async () => {
		const response = await served().request(
			`/__manifest?paths=%2Fslow&version=${build.assets.version}`,
			{ headers: browser },
		);
		expect(response.status).toBe(200);
		const manifest = (await response.json()) as Record<string, unknown>;
		expect(Object.keys(manifest)).toContain('routes/slow');
	});

	test('HEAD carries the headers of the GET, and no body', async () => {
		const response = await served().request('/', {
			method: 'HEAD',
			headers: browser,
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html');
		expect(await response.text()).toBe('');
	});
});

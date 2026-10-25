import { describe, expect, test } from 'bun:test';
import { browser, text } from '../../test/fixture';
import { loadBuild, served } from '../../test/react-router-helpers';

loadBuild();

// The fixture's build imports the package by its published name: these
// prove that the `data()` it throws is the one React Router answers with.
describe('the fixture app through /errors', () => {
	test("a loader's routeError answers its status, and the page carries the request id", async () => {
		const response = await served().request('/refused', { headers: browser });
		expect(response.status).toBe(404);
		expect(text(await response.text())).toMatch(
			/<p id="request"[^>]*>r-1<\/p>/,
		);
	});

	test("an action's fetcherResult answers the refusal with its status", async () => {
		const response = await served().request('/refused.data', {
			method: 'POST',
			headers: { ...browser, 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'x' }),
		});
		expect(response.status).toBe(409);
		const body = await response.text();
		expect(body).toContain('"ok"');
		expect(body).toContain('rename');
	});
});

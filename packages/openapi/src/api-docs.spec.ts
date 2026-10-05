import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';
import { apiDocs, isApiDocsRoute } from './api-docs';
import { matchesSpec } from './routes';

const spec = {
	openapi: '3.1.0',
	info: { title: 'Pets', version: '1' },
	servers: [{ url: 'https://pets.example.com' }],
	paths: {},
};
const dir = mkdtempSync(join(tmpdir(), 'api-docs-'));
const yamlFile = join(dir, 'openapi.yaml');
const jsonFile = join(dir, 'openapi.json');
writeFileSync(
	yamlFile,
	'# the pets\nopenapi: 3.1.0\ninfo:\n  title: Pets\n  version: "1"\npaths: {}\n',
);
writeFileSync(jsonFile, JSON.stringify(spec));

describe('the page', () => {
	test('is an HTML page with Scalar, pinned and checked by SRI', async () => {
		const app = alxia().plugin(apiDocs({ spec }));
		const response = await app.request('/docs');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		const html = await response.text();
		expect(html).toContain('<title>Pets</title>');
		expect(html).toContain('data-url="/docs/openapi.json"');
		expect(html).toMatch(/@scalar\/api-reference@\d+\.\d+\.\d+\//);
		expect(html).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/);
	});

	test('is Swagger UI with ui: swagger, its script under a nonce', async () => {
		const app = alxia().plugin(
			apiDocs({ spec, ui: 'swagger', title: 'My <API>' }),
		);
		const response = await app.request('/docs');
		const html = await response.text();
		expect(html).toContain('<title>My &lt;API&gt;</title>');
		expect(html).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui-bundle/);
		const nonce = /<script nonce="([^"]+)">/.exec(html)?.[1];
		expect(nonce).toBeDefined();
		expect(response.headers.get('content-security-policy')).toContain(
			`'nonce-${nonce}'`,
		);
	});
});

describe('the spec', () => {
	test('is served as YAML as written, and as JSON, from a YAML file', async () => {
		const app = alxia().plugin(apiDocs({ spec: yamlFile }));
		const yaml = await app.request('/docs/openapi.yaml');
		expect(yaml.headers.get('content-type')).toContain('application/yaml');
		expect(await yaml.text()).toStartWith('# the pets');
		const json = await app.request('/docs/openapi.json');
		expect(json.headers.get('content-type')).toContain('application/json');
		expect(await json.json()).toMatchObject({ info: { title: 'Pets' } });
	});

	test('is served as YAML and JSON from a JSON file or an object', async () => {
		for (const source of [jsonFile, spec]) {
			const app = alxia().plugin(apiDocs({ spec: source }));
			const yaml = await (await app.request('/docs/openapi.yaml')).text();
			expect(Bun.YAML.parse(yaml)).toEqual(spec);
			expect(await (await app.request('/docs/openapi.json')).json()).toEqual(
				spec,
			);
		}
	});

	test('has its servers replaced by the option, in both files', async () => {
		const servers = [{ url: 'http://localhost:3000', description: 'dev' }];
		const app = alxia().plugin(apiDocs({ spec: yamlFile, servers }));
		const json = (await (await app.request('/docs/openapi.json')).json()) as {
			servers: unknown;
		};
		expect(json.servers).toEqual(servers);
		const yaml = await (await app.request('/docs/openapi.yaml')).text();
		expect((Bun.YAML.parse(yaml) as { servers: unknown }).servers).toEqual(
			servers,
		);
	});

	test('is refused at startup when it cannot be read or is no document', () => {
		expect(() => apiDocs({ spec: join(dir, 'missing.yaml') })).toThrow(
			/apiDocs\(\): cannot read the spec ".*missing\.yaml" \(ENOENT\)/,
		);
		expect(() => apiDocs({ spec: { paths: {} } })).toThrow(
			'apiDocs(): the spec is not an OpenAPI document',
		);
		expect(() => apiDocs({ spec, path: '/docs/' })).toThrow(
			'must start with "/" and not end with one',
		);
		expect(() => apiDocs({ spec, path: 'docs' as '/docs' })).toThrow(
			'must start with "/" and not end with one',
		);
		expect(() => apiDocs({ spec, ui: 'redoc' as 'scalar' })).toThrow(
			'ui "redoc" is not "scalar" or "swagger"',
		);
	});
});

describe('options', () => {
	test('a custom path moves the page and the files', async () => {
		const app = alxia().plugin(apiDocs({ spec, path: '/reference/api' }));
		expect((await app.request('/docs')).status).toBe(404);
		const html = await (await app.request('/reference/api')).text();
		expect(html).toContain('data-url="/reference/api/openapi.json"');
		expect((await app.request('/reference/api/openapi.json')).status).toBe(200);
	});

	test('enabled: false mounts nothing, and reads nothing', async () => {
		const app = alxia().plugin(
			apiDocs({ spec: 'missing.yaml', enabled: false }),
		);
		expect(app.routes).toHaveLength(0);
		expect((await app.request('/docs')).status).toBe(404);
	});
});

describe('with secureHeaders', () => {
	test.each([false, true])(
		'the page keeps its own policy (nonce: %p)',
		async (nonce) => {
			const headers = nonce
				? secureHeaders({
						nonce,
						contentSecurityPolicy: "default-src 'none'; script-src 'self'",
					})
				: secureHeaders();
			const app = alxia().use(headers).plugin(apiDocs({ spec }));
			const response = await app.request('/docs');
			const policy = response.headers.get('content-security-policy');
			expect(policy).toContain('script-src https://cdn.jsdelivr.net');
			expect(response.headers.get('x-content-type-options')).toBe('nosniff');
			// every other response keeps the strict policy
			const other = await app.request('/nothing');
			expect(other.headers.get('content-security-policy')).toStartWith(
				"default-src 'none'; ",
			);
		},
	);
});

describe('matchesSpec', () => {
	const ping = {
		method: 'GET',
		path: '/ping',
		schema: { detail: { operationId: 'ping' } },
	} as const;
	const app = alxia()
		.route(ping, ({ reply }) => reply(200, 'pong'))
		.plugin(apiDocs({ spec }));

	test('leaves the docs routes out without an exclude', () => {
		expect(() => matchesSpec(app, { ping })).not.toThrow();
		expect(app.routes.filter(isApiDocsRoute)).toHaveLength(3);
	});

	test('still names a route of its own that no operation declares', () => {
		const extra = app.get('/admin', ({ reply }) => reply(200, 'x'));
		expect(() => matchesSpec(extra, { ping })).toThrow(
			'1 route has no operation: GET /admin',
		);
	});
});

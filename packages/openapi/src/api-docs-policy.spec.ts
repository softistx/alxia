/**
 * The page's policy allows the pinned version of its UI alone, and
 * requests to this server and the document's servers alone; Scalar is
 * configured to reach none of its own services.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { apiDocs } from './api-docs';

const document = (servers?: readonly { url: string }[]) => ({
	openapi: '3.1.0',
	info: { title: 'Pets', version: '1' },
	paths: {},
	...(servers === undefined ? {} : { servers }),
});

async function policyOf(options: Parameters<typeof apiDocs>[0]) {
	const response = await alxia().plugin(apiDocs(options)).request('/docs');
	const policy = response.headers.get('content-security-policy') ?? '';
	const directive = (name: string) =>
		policy.split('; ').find((part) => part.startsWith(`${name} `));
	return { html: await response.text(), directive };
}

describe("the page's policy", () => {
	test.each([
		['scalar', 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@'],
		['swagger', 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@'],
	] as const)(
		'%s: its pinned version alone, for scripts and styles',
		async (ui, files) => {
			const { html, directive } = await policyOf({ spec: document(), ui });
			const folder = new RegExp(
				`${files.replaceAll('.', '\\.')}\\d+\\.\\d+\\.\\d+/`,
			);
			const pinned = html.match(folder)?.[0];
			expect(pinned).toBeDefined();
			expect(directive('script-src')).toStartWith(
				`script-src ${pinned} 'nonce-`,
			);
			expect(directive('style-src')).toBe(
				`style-src ${pinned} 'unsafe-inline'`,
			);
		},
	);

	test("connect-src: this server, and the document's absolute servers' origins", async () => {
		const { directive } = await policyOf({
			spec: document([
				{ url: 'https://api.example.com/v1' },
				{ url: 'http://localhost:3000' },
				{ url: '/relative' },
				{ url: 'https://{region}.example.com' },
			]),
		});
		expect(directive('connect-src')).toBe(
			"connect-src 'self' https://api.example.com http://localhost:3000",
		);
		const { directive: none } = await policyOf({ spec: document() });
		expect(none('connect-src')).toBe("connect-src 'self'");
	});

	test("the servers option replaces the document's, in the policy too", async () => {
		const { directive } = await policyOf({
			spec: document([{ url: 'https://api.example.com' }]),
			servers: [{ url: 'https://staging.example.com/api' }],
		});
		expect(directive('connect-src')).toBe(
			"connect-src 'self' https://staging.example.com",
		);
	});
});

describe("Scalar's configuration", () => {
	test('turns off its AI agent, MCP, developer tools and telemetry', async () => {
		const { html } = await policyOf({ spec: document() });
		const attribute = html.match(/data-configuration="([^"]+)"/)?.[1] ?? '';
		expect(JSON.parse(attribute.replaceAll('&quot;', '"'))).toEqual({
			url: '/docs/openapi.json',
			agent: { disabled: true },
			mcp: { disabled: true },
			showDeveloperTools: 'never',
			telemetry: false,
		});
	});
});

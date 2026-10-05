/**
 * GraphiQL: by default in the serving app's dev alone, under a policy
 * that lets its pinned files and Monaco's workers load, and nothing else.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { type GraphQLOptions, graphql } from './graphql';
import { graphiqlPolicy } from './handler';

const schema = createSchema({
	typeDefs: 'type Query { hello: String }',
	resolvers: { Query: { hello: () => 'world' } },
});
const html = { headers: { accept: 'text/html' } };

const served = (
	dev: boolean,
	ide?: GraphQLOptions<object, object, '/graphql'>['ide'],
) =>
	alxia({ dev }).plugin((app) =>
		graphql(app, { schema, ...(ide === undefined ? {} : { ide }) }),
	);

describe("graphql()'s ide", () => {
	test('by default, GraphiQL in dev, and no page outside it', async () => {
		const dev = await served(true).request('/graphql', html);
		expect(dev.headers.get('content-type')).toContain('text/html');
		expect(await dev.text()).toContain('GraphiQL');
		const deployed = await served(false).request('/graphql', html);
		expect(deployed.headers.get('content-type') ?? '').not.toContain(
			'text/html',
		);
	});

	test("ide: 'graphiql' serves it outside dev, ide: false not in dev", async () => {
		const forced = await served(false, 'graphiql').request('/graphql', html);
		expect(await forced.text()).toContain('GraphiQL');
		const off = await served(true, false).request('/graphql', html);
		expect(off.headers.get('content-type') ?? '').not.toContain('text/html');
	});
});

describe("GraphiQL's policy", () => {
	test('its pinned files alone, for scripts, styles, fonts and the workers it fetches; framed by no one', async () => {
		const page = await served(true).request('/graphql', html);
		const body = await page.text();
		const files = body.match(
			/https:\/\/unpkg\.com\/@graphql-yoga\/graphiql@[\w.-]+\//,
		)?.[0];
		expect(files).toBeDefined();
		const policy = page.headers.get('content-security-policy') ?? '';
		const directive = (name: string) =>
			policy.split('; ').find((part) => part.startsWith(`${name} `));
		expect(directive('script-src')).toBe(
			`script-src 'self' 'unsafe-inline' ${files}`,
		);
		expect(directive('connect-src')).toBe(`connect-src 'self' ${files}`);
		expect(directive('worker-src')).toBe("worker-src 'self' blob:");
		expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
		expect(policy).not.toMatch(/https:\/\/unpkg\.com[ ;]/);
	});

	test('a page that names no file of unpkg gets this server alone', () => {
		expect(graphiqlPolicy('<html></html>')).toBe(
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
		);
	});
});

import { describe, expect, test } from 'bun:test';
import { requireBun } from './runtime';

describe('requireBun', () => {
	test('lets Bun through', () => {
		expect(() => requireBun('react-router dev')).not.toThrow();
	});

	test('refuses Node, saying how to start on Bun', () => {
		expect(() => requireBun('react-router dev', undefined, false)).toThrow(
			'alxia-react-router: react-router dev is running on Node, and alxia\'s server runs on Bun. Add a bunfig.toml beside package.json with "[run]" and "bun = true", so bun run starts it on Bun, or run it as bun --bun react-router dev.',
		);
	});

	test('takes its reason from the caller', () => {
		expect(() =>
			requireBun(
				'react-router build',
				undefined,
				false,
				'and the worker is bundled by Bun.build',
			),
		).toThrow(
			'alxia-react-router: react-router build is running on Node, and the worker is bundled by Bun.build. Add',
		);
	});
});

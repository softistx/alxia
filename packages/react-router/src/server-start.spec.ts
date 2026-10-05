import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { FIXTURE } from '../test/fixture';
import { loadBuild } from '../test/react-router-helpers';

const SERVER_BUILD = join(FIXTURE, 'build', 'server', 'index.js');

loadBuild();

describe('start', () => {
	test("listen's port and hostname win over PORT and HOST, and onListen is told", async () => {
		const { child, out } = await run(
			[
				'const server = createServer({',
				"\tlisten: { port: 0, hostname: '127.0.0.1' },",
				`\tonListen: (listening) => console.log(\`told \${listening.url}\`),`,
				'});',
				'server.start(server.create({ build }));',
			],
			'told ',
			{ PORT: '1', HOST: '0.0.0.0' },
		);
		try {
			const url = out.match(/told (\S+)/)?.[1] as string;
			expect(url).toStartWith('http://127.0.0.1:');
			expect(url).not.toBe('http://127.0.0.1:1/');
			expect((await fetch(new URL('/nowhere', url))).status).toBe(404);
			child.kill('SIGTERM');
			expect(await child.exited).toBe(0);
		} finally {
			child.kill();
		}
	});

	test('a signal sent from onListen runs the onStop hooks: the handlers are in place first', async () => {
		const { child, out } = await run(
			[
				'const server = createServer({',
				"\tconfigure: (app) => app.onStop(() => console.log('onStop ran')),",
				"\tlisten: { port: 0, hostname: '127.0.0.1' },",
				"\tonListen: () => process.kill(process.pid, 'SIGTERM'),",
				'});',
				'server.start(server.create({ build }));',
			],
			'onStop ran',
		);
		try {
			expect(out).toContain('onStop ran');
			expect(await child.exited).toBe(0);
		} finally {
			child.kill();
		}
	});

	test('an onStop hook that throws on SIGTERM ends the process with 1, printing the error', async () => {
		const { child } = await run(
			[
				'const server = createServer({',
				"\tconfigure: (app) => app.onStop(() => { throw new Error('pool would not close'); }),",
				"\tlisten: { port: 0, hostname: '127.0.0.1' },",
				'});',
				'server.start(server.create({ build }));',
			],
			'alxia listening on',
		);
		try {
			child.kill('SIGTERM');
			expect(await child.exited).toBe(1);
			expect(await new Response(child.stderr).text()).toContain(
				'pool would not close',
			);
		} finally {
			child.kill();
		}
	});
});

/**
 * A process that imports the package and the fixture's build, then runs
 * `lines`: `start` installs signal handlers, kept out of the test's own
 * process. Resolves once its output holds `ready`.
 */
async function run(
	lines: readonly string[],
	ready: string,
	env: Record<string, string> = {},
) {
	const script = [
		"import { createServer } from '@alxia/react-router';",
		`const build = await import(${JSON.stringify(SERVER_BUILD)});`,
		...lines,
	].join('\n');
	const child = Bun.spawn([process.execPath, '-e', script], {
		cwd: join(import.meta.dir, '..'),
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const reader = child.stdout.getReader();
	let out = '';
	while (!out.includes(ready)) {
		const { done, value } = await reader.read();
		if (done) {
			child.kill();
			throw new Error(`exited: ${out}`);
		}
		out += new TextDecoder().decode(value);
	}
	reader.releaseLock();
	return { child, out };
}

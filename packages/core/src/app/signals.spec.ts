/**
 * `listen` shuts the app down on `SIGTERM` and `SIGINT`, in a process of
 * its own (`test/fixtures/shutdown.ts`): the request in flight finishes,
 * the `onStop` hooks run, and the process exits 0 — or 1 when a hook
 * throws or outlasts `stopTimeout`; `signals: false` leaves the signal to
 * the process, `exit: false` and another listener of the signal the exit.
 */
import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(
	new URL('../../test/fixtures/shutdown.ts', import.meta.url),
);

/** The fixture, started, with its URL once it listens, and everything it printed. */
async function started(env: Record<string, string> = {}) {
	const child = Bun.spawn([process.execPath, FIXTURE], {
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const decoder = new TextDecoder();
	const reader = child.stdout.getReader();
	let out = '';
	while (!out.includes('\n')) {
		const { value, done } = await reader.read();
		if (done) throw new Error(`the fixture exited: ${out}`);
		out += decoder.decode(value);
	}
	const url = out.match(/listening (\S+)/)?.[1] as string;
	const rest = (async () => {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) return out;
			out += decoder.decode(value);
		}
	})();
	return { child, url, printed: () => rest };
}

describe('listen() and the signals', () => {
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		test(`${signal}: the request in flight finishes, onStop runs, the process exits 0`, async () => {
			const { child, url, printed } = await started();
			const slow = fetch(`${url}slow`).then((response) => response.text());
			await Bun.sleep(50);
			child.kill(signal);
			expect(await slow).toBe('done');
			expect(await child.exited).toBe(0);
			expect(await printed()).toContain('onStop');
		});
	}

	test('an onStop hook that throws ends the process with 1, printing the error', async () => {
		const { child } = await started({ STOP: 'throw' });
		child.kill('SIGTERM');
		expect(await child.exited).toBe(1);
		expect(await new Response(child.stderr).text()).toContain(
			'the pool would not close',
		);
	});

	test('signals: false leaves the signal to the process: no onStop', async () => {
		const { child, printed } = await started({ SIGNALS: 'off' });
		child.kill('SIGTERM');
		expect(await child.exited).not.toBe(0);
		expect(await printed()).not.toContain('onStop');
	});

	test('exit: false shuts the app down and leaves the exit to the process', async () => {
		const { child, printed } = await started({ EXIT: 'off' });
		child.kill('SIGTERM');
		expect(await child.exited).toBe(5);
		expect(await printed()).toContain('onStop\nafter stop');
	});

	test("another SIGTERM listener: alxia stops its app and lets the host's cleanup finish", async () => {
		const { child, printed } = await started({ HOST: 'on' });
		child.kill('SIGTERM');
		expect(await child.exited).toBe(3);
		const out = await printed();
		expect(out).toContain('onStop');
		expect(out).toContain('host cleanup');
	});

	test('an onStop hook that never settles: past stopTimeout, it is named and the process exits 1', async () => {
		const { child } = await started({ STOP: 'hang' });
		const start = performance.now();
		child.kill('SIGTERM');
		const code = await Promise.race([child.exited, Bun.sleep(3_000)]);
		if (code === undefined) child.kill('SIGKILL');
		expect(code).toBe(1);
		expect(performance.now() - start).toBeLessThan(2_000);
		expect(await new Response(child.stderr).text()).toContain(
			'onStop hook closePool (1 of 1) did not finish within 200 ms',
		);
	});
});

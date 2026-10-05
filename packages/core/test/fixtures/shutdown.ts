/**
 * A served app the signals spec runs as a process of its own: it prints
 * `listening <url>` once its handlers are in place, answers `/slow` after
 * 300 ms, and prints `onStop` when its hook runs. `SIGNALS=off` listens
 * with `signals: false`; `STOP=throw` makes the hook throw, `STOP=hang`
 * never settle (under `stopTimeout: 200`); `EXIT=off` listens with
 * `exit: false` and exits with 5 by itself after the hook; `HOST=on`
 * installs the host's own `SIGTERM` handler, which cleans up for 200 ms
 * then exits with 3.
 */
import { alxia } from '../../src/index';

const { SIGNALS, STOP, EXIT, HOST } = process.env;

const app = alxia()
	.onStop(function closePool(): Promise<void> | undefined {
		console.log('onStop');
		if (STOP === 'throw') throw new Error('the pool would not close');
		if (STOP === 'hang') return new Promise<void>(() => {});
		if (EXIT === 'off') {
			setTimeout(() => {
				console.log('after stop');
				process.exit(5);
			}, 200);
		}
		return undefined;
	})
	.get('/slow', async ({ reply }) => {
		await Bun.sleep(300);
		return reply(200, 'done');
	});

if (HOST === 'on') {
	process.on('SIGTERM', async () => {
		await Bun.sleep(200);
		console.log('host cleanup');
		process.exit(3);
	});
}

const server = app.listen({
	port: 0,
	...(SIGNALS === 'off' ? { signals: false as const } : {}),
	...(EXIT === 'off' ? { exit: false } : {}),
	...(STOP === 'hang' ? { stopTimeout: 200 } : {}),
});
console.log(`listening ${server.url.href}`);

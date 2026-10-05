/**
 * A served app the signals spec runs as a process of its own: it prints
 * `listening <url>` once its handlers are in place, answers `/slow` after
 * 300 ms, and prints `onStop` when its hook runs. `SIGNALS=off` listens
 * with `signals: false`; `STOP=throw` makes the hook throw.
 */
import { alxia } from '../../src/index';

const app = alxia()
	.onStop(() => {
		console.log('onStop');
		if (process.env['STOP'] === 'throw')
			throw new Error('the pool would not close');
	})
	.get('/slow', async ({ reply }) => {
		await Bun.sleep(300);
		return reply(200, 'done');
	});

const server = app.listen(
	process.env['SIGNALS'] === 'off' ? { port: 0, signals: false } : { port: 0 },
);
console.log(`listening ${server.url.href}`);

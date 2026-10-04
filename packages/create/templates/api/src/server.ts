import { app } from './app';

// Stop as the platform asks. In a container Bun is process 1, which a
// signal with no handler does not stop: `docker stop` would wait.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		void app.stop().then(
			() => process.exit(0),
			(error: unknown) => {
				console.error(error);
				process.exit(1);
			},
		);
	});
}

const server = app.listen(Number(Bun.env['PORT'] ?? 3000));
console.log(`listening on ${server.url}`);

import { afterAll } from 'bun:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

// Preloaded by `bun test` (bunfig.toml): one in-memory MongoDB, a one-node
// replica set so that transactions work, for the whole run.
const replSet = await MongoMemoryReplSet.create({
	replSet: { count: 1, storageEngine: 'wiredTiger' },
});
Bun.env['MONGO_URI'] = replSet.getUri();

afterAll(async () => {
	const { closeTestClient } = await import('./harness');
	await closeTestClient();
	await replSet.stop();
});

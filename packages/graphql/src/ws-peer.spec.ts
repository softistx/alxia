/**
 * `ws` on without the optional peer `graphql-ws`: the upgrade is answered
 * with a 500, and the error logged names the package to add. Run in a
 * process of its own (`test/missing-peer/upgrade.ts`), whose mock makes the
 * package missing.
 */
import { expect, test } from 'bun:test';

test('a missing graphql-ws is named on the upgrade', () => {
	const run = Bun.spawnSync(
		[process.execPath, 'test', './test/missing-peer/upgrade.ts'],
		{ cwd: `${import.meta.dir}/..`, stdout: 'pipe', stderr: 'pipe' },
	);
	expect(run.stderr.toString()).toContain('1 pass');
	expect(run.exitCode).toBe(0);
});

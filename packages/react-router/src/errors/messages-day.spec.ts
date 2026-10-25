import { describe, expect, test } from 'bun:test';

const SCRIPT = new URL('../../test/errors/day-in-zone.ts', import.meta.url)
	.pathname;
const ZONES = [
	'Pacific/Kiritimati',
	'America/Los_Angeles',
	'Asia/Kolkata',
	'UTC',
];

describe('a date argument', () => {
	test('is a calendar day, the same in any time zone', () => {
		for (const zone of ZONES) {
			const run = Bun.spawnSync([process.execPath, 'run', SCRIPT], {
				env: { ...process.env, TZ: zone },
				stderr: 'pipe',
			});
			const [en, fr] = JSON.parse(run.stdout.toString()) as string[];
			expect([zone, en]).toEqual([
				zone,
				'The list ends on February 12, 2027: a todo cannot be due later.',
			]);
			expect(fr).toContain('12 février 2027');
		}
	});
});

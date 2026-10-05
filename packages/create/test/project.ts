/** What the template specs share: a generated project to run, and its bundle run alone. */
import { afterAll, beforeAll, expect } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { copyTemplate } from '../src/copy';
import { alxiaRanges } from '../src/versions';

/**
 * Writes `template` into `.fixture-<template>` inside the package, so the
 * project resolves `@alxia/*`, Zod and the rest to this workspace's: it
 * typechecks and passes its own spec against them with no install.
 * `scripts/verify-templates.ts` does the same from the packed tarballs,
 * installed. Removed after the file.
 */
export function useFixture(template: string): string {
	const dir = join(import.meta.dir, '..', `.fixture-${template}`);
	beforeAll(async () => {
		await rm(dir, { recursive: true, force: true });
		const { manifest, files } = await copyTemplate(
			template as never,
			`fixture-${template}`,
			await alxiaRanges(),
		);
		for (const [file, content] of Object.entries(files)) {
			await Bun.write(join(dir, file), content);
		}
		await Bun.write(
			join(dir, 'package.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
	});
	afterAll(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

/**
 * `bun run build` in `dir`, then `dist/` alone, with no `node_modules`,
 * run as the image runs it (`--no-install`, which would fetch a missing
 * package): `request` answers from it, and SIGTERM stops it with exit 0 — in
 * a container Bun is process 1, which a signal with no handler leaves running
 * until `docker stop`'s timeout. Resolves to the response's status.
 */
export async function distAnswers(
	dir: string,
	entry: string,
	request: (base: URL) => Promise<Response>,
): Promise<number> {
	const built = await $`${process.execPath} run build`
		.cwd(dir)
		.nothrow()
		.quiet();
	expect(built.exitCode).toBe(0);
	const alone = await mkdtemp(join(tmpdir(), 'alxia-dist-'));
	await cp(join(dir, 'dist'), join(alone, 'dist'), { recursive: true });
	const server = Bun.spawn([process.execPath, '--no-install', entry], {
		cwd: alone,
		env: { PATH: process.env['PATH'] ?? '', PORT: '0' },
		stdout: 'pipe',
	});
	try {
		const reader = server.stdout.getReader();
		let out = '';
		let url: string | undefined;
		while (url === undefined) {
			const { done, value } = await reader.read();
			if (done) throw new Error(`${entry} exited: ${out}`);
			out += new TextDecoder().decode(value);
			url = out.match(/listening on (\S+)/)?.[1];
		}
		const { status } = await request(new URL(url));
		server.kill('SIGTERM');
		expect(await server.exited).toBe(0);
		return status;
	} finally {
		server.kill();
		await rm(alone, { recursive: true, force: true });
	}
}

/** `bun run check:ci` on `dir` after its build: no error, warning or info. */
export async function expectBiomeClean(
	dir: string,
	bundle: string,
): Promise<void> {
	// After the build: dist/ is there, minified, and must be skipped.
	expect(await Bun.file(join(dir, bundle)).exists()).toBe(true);
	const result = await $`${process.execPath} run check:ci --colors=off`
		.cwd(dir)
		.nothrow()
		.quiet();
	const output = `${result.stdout}${result.stderr}`;
	expect(output).not.toMatch(/Found \d+ (error|warning|info)/);
	expect(output).toMatch(/Checked \d+ files/);
	expect(result.exitCode).toBe(0);
}

/** The workspace's `tsc` over `dir`, on Bun: TypeScript 7 exports no bin to resolve. */
export async function expectTypechecks(dir: string): Promise<void> {
	const result = await $`${process.execPath} --bun tsc --noEmit -p ${dir}`
		.cwd(import.meta.dir)
		.nothrow()
		.quiet();
	expect(result.stdout.toString()).toBe('');
	expect(result.exitCode).toBe(0);
}

/** `bun test` in `dir`: `passing` tests, none failing. */
export async function expectSpecPasses(
	dir: string,
	passing: number,
): Promise<void> {
	const result = await $`${process.execPath} test`.cwd(dir).nothrow().quiet();
	const output = result.stderr.toString();
	expect(output).toContain(` ${passing} pass`);
	expect(output).toContain(' 0 fail');
	expect(result.exitCode).toBe(0);
}

/** The Dockerfile's contract: builds, runs the start command on dist/ alone as Bun's user. */
export async function expectDockerfile(
	template: string,
	scripts: Record<string, string>,
	dockerfile: string,
): Promise<void> {
	const cmd = JSON.parse(/^CMD (.+)$/m.exec(dockerfile)?.[1] ?? 'null');
	// start's command, and --no-install: no package is fetched at startup.
	expect(cmd.join(' ')).toBe(
		scripts['start']?.replace(/^bun /, 'bun --no-install '),
	);
	const [build, final] = dockerfile.split(/^(?=FROM )/m).slice(1);
	expect(build, template).toStartWith('FROM oven/bun:1 AS build\n');
	expect(build).toContain('RUN bun install --frozen-lockfile\n');
	expect(build).toContain('RUN bun run build\n');
	expect(final).toStartWith('FROM oven/bun:1-alpine\n');
	expect(final?.match(/^COPY .+$/gm)).toEqual([
		'COPY --from=build /app/dist ./dist',
	]);
	expect(final).toContain('\nUSER bun\n');
}

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { copyTemplate } from '../copy';
import { alxiaRanges } from '../versions';

// Inside the package, so the project resolves @alxia/core and zod
// to this workspace's: the template typechecks and passes its own spec
// against them with no install. scripts/verify-templates.ts does the same
// from the packed tarballs, installed.
const dir = join(import.meta.dir, '..', '..', '.fixture-api');

beforeAll(async () => {
	await rm(dir, { recursive: true, force: true });
	const { manifest, files } = await copyTemplate(
		'api',
		'fixture-api',
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

describe('the api template', () => {
	test("its manifest: alxia's versions, and the scripts its README names", async () => {
		const { manifest } = await copyTemplate(
			'api',
			'my-api',
			await alxiaRanges(),
		);
		expect(manifest['scripts']).toEqual({
			dev: 'bun --watch src/server.ts',
			build:
				'bun build src/server.ts --target=bun --outdir=dist --minify --sourcemap=linked',
			start: 'bun dist/server.js',
			test: 'bun test',
			typecheck: 'tsc --noEmit',
			lint: 'biome lint',
			format: 'biome format --write',
			check: 'biome check --write',
			'check:ci': 'biome ci',
			verify: 'bun run check:ci && bun run typecheck && bun run test',
		});
		expect(Object.keys(manifest.dependencies ?? {})).toEqual([
			'@alxia/core',
			'zod',
		]);
		expect(Object.keys(manifest.devDependencies ?? {})).toEqual([
			'@biomejs/biome',
			'@types/bun',
			'typescript',
		]);
	});

	test("its Dockerfile builds, and runs the start script's command on dist/ alone, as Bun's user, never installing", async () => {
		const { manifest, files } = await copyTemplate(
			'api',
			'my-api',
			await alxiaRanges(),
		);
		const dockerfile = (await files['Dockerfile']?.text()) ?? '';
		const scripts = manifest['scripts'] as Record<string, string>;
		const cmd = JSON.parse(/^CMD (.+)$/m.exec(dockerfile)?.[1] ?? 'null');
		// start's command, and --no-install: no package is fetched at startup.
		expect(cmd.join(' ')).toBe(
			scripts['start']?.replace(/^bun /, 'bun --no-install '),
		);
		const [build, final] = dockerfile.split(/^(?=FROM )/m).slice(1);
		expect(build).toStartWith('FROM oven/bun:1 AS build\n');
		expect(build).toContain('RUN bun install --frozen-lockfile\n');
		expect(build).toContain('RUN bun run build\n');
		expect(final).toStartWith('FROM oven/bun:1-alpine\n');
		expect(final?.match(/^COPY .+$/gm)).toEqual([
			'COPY --from=build /app/dist ./dist',
		]);
		expect(final).toContain('\nUSER bun\n');
	});

	test('bun run build makes a dist/ that answers alone, with no node_modules', async () => {
		const built = await $`${process.execPath} run build`
			.cwd(dir)
			.nothrow()
			.quiet();
		expect(built.exitCode).toBe(0);
		const alone = await mkdtemp(join(tmpdir(), 'alxia-api-dist-'));
		await cp(join(dir, 'dist'), join(alone, 'dist'), { recursive: true });
		// --no-install, as the image runs it: Bun would fetch a missing package.
		const server = Bun.spawn(
			[process.execPath, '--no-install', 'dist/server.js'],
			{
				cwd: alone,
				env: { PATH: process.env['PATH'] ?? '', PORT: '0' },
				stdout: 'pipe',
			},
		);
		try {
			const reader = server.stdout.getReader();
			let out = '';
			let url: string | undefined;
			while (url === undefined) {
				const { done, value } = await reader.read();
				if (done) throw new Error(`dist/server.js exited: ${out}`);
				out += new TextDecoder().decode(value);
				url = out.match(/listening on (\S+)/)?.[1];
			}
			const response = await fetch(new URL('/todos', url), {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-api-key': 'dev-key' },
				body: JSON.stringify({ title: 'From dist alone' }),
			});
			expect(response.status).toBe(201);
			// SIGTERM stops it: in a container Bun is process 1, which a signal
			// with no handler leaves running until docker stop's timeout.
			server.kill('SIGTERM');
			expect(await server.exited).toBe(0);
		} finally {
			server.kill();
			await rm(alone, { recursive: true, force: true });
		}
	}, 30_000);

	test('bun run check:ci passes on the project and its build: no error, warning or info', async () => {
		// After the build test: dist/ is there, minified, and must be skipped.
		expect(await Bun.file(join(dir, 'dist/server.js')).exists()).toBe(true);
		const result = await $`${process.execPath} run check:ci --colors=off`
			.cwd(dir)
			.nothrow()
			.quiet();
		const output = `${result.stdout}${result.stderr}`;
		expect(output).not.toMatch(/Found \d+ (error|warning|info)/);
		expect(output).toMatch(/Checked \d+ files/);
		expect(result.exitCode).toBe(0);
	});

	test('its .env.example names each variable the app reads', async () => {
		const { files } = await copyTemplate('api', 'my-api', await alxiaRanges());
		const example = (await files['.env.example']?.text()) ?? '';
		const source = [
			(await files['src/app.ts']?.text()) ?? '',
			(await files['src/server.ts']?.text()) ?? '',
		].join('\n');
		const read = [...source.matchAll(/Bun\.env\["(\w+)"\]/g)].map(
			([, name]) => name,
		);
		expect(read.sort()).toEqual(['API_KEY', 'PORT']);
		for (const name of read)
			expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
	});

	test("typechecks under this repository's strictest settings", async () => {
		// The workspace's tsc, from node_modules/.bin, on Bun: TypeScript 7
		// exports no bin/tsc to resolve, and a runner may have no node.
		const tsc = $`${process.execPath} --bun tsc --noEmit -p ${dir}`;
		const result = await tsc
			.cwd(import.meta.dir)
			.nothrow()
			.quiet();
		expect(result.stdout.toString()).toBe('');
		expect(result.exitCode).toBe(0);
	});

	test('its spec passes', async () => {
		const result = await $`${process.execPath} test`.cwd(dir).nothrow().quiet();
		const output = result.stderr.toString();
		expect(output).toContain(' 4 pass');
		expect(output).toContain(' 0 fail');
		expect(result.exitCode).toBe(0);
	}, 30_000);
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { copyTemplate } from '../copy';
import { alxiaRanges } from '../versions';

// Inside the package, so the project resolves @alxia/core, @alxia/client and
// zod to this workspace's: the template typechecks and passes its own spec
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
	await Bun.write(join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
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
		});
		expect(Object.keys(manifest.dependencies ?? {})).toEqual([
			'@alxia/core',
			'zod',
		]);
		expect(Object.keys(manifest.devDependencies ?? {})).toEqual([
			'@alxia/client',
			'@types/bun',
			'typescript',
		]);
	});

	test("its Dockerfile builds, and runs the start script's command on dist/ alone, as Bun's user", async () => {
		const { manifest, files } = await copyTemplate(
			'api',
			'my-api',
			await alxiaRanges(),
		);
		const dockerfile = (await files['Dockerfile']?.text()) ?? '';
		const scripts = manifest['scripts'] as Record<string, string>;
		const cmd = JSON.parse(/^CMD (.+)$/m.exec(dockerfile)?.[1] ?? 'null');
		expect(cmd.join(' ')).toBe(scripts['start']);
		const [build, final] = dockerfile.split(/^(?=FROM )/m).slice(1);
		expect(build).toStartWith('FROM oven/bun:1 AS build\n');
		expect(build).toContain('RUN bun install --frozen-lockfile\n');
		expect(build).toContain('RUN bun run build\n');
		expect(final).toStartWith('FROM oven/bun:1\n');
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
		const server = Bun.spawn([process.execPath, 'dist/server.js'], {
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
		} finally {
			server.kill();
			await rm(alone, { recursive: true, force: true });
		}
	}, 30_000);

	test('its .env.example names each variable the app reads', async () => {
		const { files } = await copyTemplate('api', 'my-api', await alxiaRanges());
		const example = (await files['.env.example']?.text()) ?? '';
		const source = [
			(await files['src/app.ts']?.text()) ?? '',
			(await files['src/server.ts']?.text()) ?? '',
		].join('\n');
		const read = [...source.matchAll(/Bun\.env\['(\w+)'\]/g)].map(
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
		expect(output).toContain(' 3 pass');
		expect(output).toContain(' 0 fail');
		expect(result.exitCode).toBe(0);
	}, 30_000);
});

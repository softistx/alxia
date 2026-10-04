/**
 * Runs `bun create @alxia` as a user would, from the packed tarballs, for
 * each template, then proves the project it wrote works: it installs, its
 * `typecheck`, `test` and `build` pass, and its production server answers.
 *
 * Every package is packed, and served by a registry on localhost that passes
 * every other request to npm's (`templates/registry.ts`). Bun is pointed at
 * it with `BUN_CONFIG_REGISTRY`, with an empty cache and temporary
 * directory of its own, so neither `@alxia/create` nor a package it installs
 * comes from the published versions. What is not alxia's — React Router's
 * `create-react-router`, Zod, Vite, TypeScript — comes from npm at the
 * newest versions `@alxia/create` resolves today, so this needs the network,
 * and an upstream release can turn it red with no change here. It runs in CI
 * as the `Templates` job, informational like `Newest peers`.
 *
 * `bun run build` first: it packs `dist/`.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { pack } from './artifacts/install';
import { readPackages } from './artifacts/packages';
import { staleBuilds } from './artifacts/stale';
import { startRegistry } from './templates/registry';

/** A port nothing listens on, for a server this script starts. */
function freePort(): number {
	const probe = Bun.serve({ port: 0, fetch: () => new Response() });
	const { port } = probe;
	probe.stop(true);
	if (port === undefined) throw new Error('no free port');
	return port;
}

/** Starts `bun run start` in `dir` and resolves to what `request` answers. */
async function served(
	dir: string,
	env: Record<string, string>,
	request: (base: string) => Promise<Response>,
): Promise<number> {
	const port = freePort();
	const server = Bun.spawn(['bun', 'run', 'start'], {
		cwd: dir,
		env: { ...env, PORT: String(port), NODE_ENV: 'production' },
		stdout: 'inherit',
		stderr: 'inherit',
	});
	try {
		const deadline = Date.now() + 20_000;
		while (Date.now() < deadline) {
			const status = await request(`http://localhost:${port}`).then(
				(response) => response.status,
				() => undefined,
			);
			if (status !== undefined) return status;
			await Bun.sleep(250);
		}
		return 0;
	} finally {
		server.kill();
		await server.exited;
	}
}

interface Check {
	readonly template: 'api' | 'react-router';
	readonly scripts: readonly string[];
	readonly request: (base: string) => Promise<Response>;
	readonly expected: number;
}

const CHECKS: readonly Check[] = [
	{
		template: 'api',
		scripts: ['typecheck', 'test', 'build'],
		request: (base) =>
			fetch(`${base}/todos`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-api-key': 'dev-key' },
				body: JSON.stringify({ title: 'From the template check' }),
			}),
		expected: 201,
	},
	{
		template: 'react-router',
		scripts: ['typecheck', 'build'],
		request: (base) => fetch(`${base}/`),
		expected: 200,
	},
];

async function main(): Promise<boolean> {
	const packages = await readPackages();
	const stale = await staleBuilds(packages);
	if (stale.length > 0) {
		console.error(
			`A stale build, which this would pack:\n  ${stale.join('\n  ')}\nRun \`bun run build\` first.`,
		);
		return false;
	}
	const workdir = await mkdtemp(join(tmpdir(), 'alxia-templates-'));
	await mkdir(join(workdir, 'tarballs'));
	const packed = await pack(join(workdir, 'tarballs'), packages);
	const registry = await startRegistry(
		packed.tarballs.map(({ manifest }) => ({
			manifest,
			file: (packed.overrides[manifest['name'] as string] as string).slice(
				'file:'.length,
			),
		})),
	);
	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		BUN_CONFIG_REGISTRY: registry.url,
		BUN_INSTALL_CACHE_DIR: join(workdir, 'cache'),
		TMPDIR: join(workdir, 'tmp'),
	};
	await mkdir(env['TMPDIR'] as string, { recursive: true });
	let ok = true;
	try {
		// `bun create @alxia` is `bunx @alxia/create`: the same bin, run alone.
		const help = await $`bunx @alxia/create --help`
			.cwd(workdir)
			.env(env)
			.nothrow()
			.quiet();
		const usage =
			help.exitCode === 0 &&
			help.stdout.toString().startsWith('Usage: bun create @alxia');
		console.log(`${usage ? 'ok  ' : 'FAIL'} bunx @alxia/create --help`);
		if (!usage) console.error(help.stdout.toString(), help.stderr.toString());
		ok &&= usage;
		for (const check of CHECKS) {
			const name = `my-${check.template}`;
			const dir = join(workdir, name);
			console.log(
				`\n=== bun create @alxia ${name} --template ${check.template}\n`,
			);
			const created =
				await $`bun create @alxia ${name} --template ${check.template}`
					.cwd(workdir)
					.env(env)
					.nothrow();
			if (created.exitCode !== 0) {
				console.error(
					`FAIL ${check.template}: bun create exited ${created.exitCode}`,
				);
				ok = false;
				continue;
			}
			// The project's alxia packages are this checkout's, not npm's.
			const lock = await Bun.file(join(dir, 'bun.lock')).text();
			const local = lock.includes(`${registry.url}/-/@alxia-core-`);
			console.log(
				`${local ? 'ok  ' : 'FAIL'} ${check.template}: @alxia/core installed from the packed tarball`,
			);
			ok &&= local;
			console.log(
				`\n${check.template}'s package.json:\n${await Bun.file(join(dir, 'package.json')).text()}`,
			);
			for (const script of check.scripts) {
				console.log(`\n=== ${check.template}: bun run ${script}\n`);
				const run = await $`bun run ${script}`.cwd(dir).env(env).nothrow();
				if (run.exitCode !== 0) {
					console.error(
						`FAIL ${check.template}: bun run ${script} exited ${run.exitCode}`,
					);
					ok = false;
				}
			}
			const status = await served(dir, env, check.request);
			const passed = status === check.expected;
			console.log(
				`${passed ? 'ok  ' : 'FAIL'} ${check.template}: bun run start answered ${status}, expected ${check.expected}`,
			);
			ok &&= passed;
		}
	} finally {
		registry.stop();
		await rm(workdir, { recursive: true, force: true });
	}
	return ok;
}

if (import.meta.main && !(await main())) {
	process.exit(1);
}

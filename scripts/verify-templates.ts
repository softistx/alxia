/**
 * Runs `bun create @alxia` as a user would, from the packed tarballs, for
 * each template (`templates/checks.ts`), then proves the project it wrote
 * works: it installs, its scripts pass (`verify` for `minimal`, `api` and
 * `graphql`: `generate --check` first for the last two, since their
 * committed `src/generated/` is what the generator they installed writes,
 * then `check:ci` and `typecheck` and `test`; `typecheck` and `build` for
 * `react-router`, plus `build` for all), then `check:ci` (Biome) with no
 * error, warning or info, over what they generated, its production server answers —
 * the route a client calls first, `/health` for `api` and `graphql`, `/docs`
 * for `api` — and so does the image its `Dockerfile` builds (`templates/docker.ts`): skipped
 * locally with no Docker daemon, a failure on CI.
 *
 * Every package is packed, and served by a registry on localhost that passes
 * every other request to npm's (`templates/registry.ts`). Bun is pointed at
 * it with `BUN_CONFIG_REGISTRY`, with an empty cache and temporary
 * directory of its own, so neither `@alxia/create` nor a package it installs
 * comes from the published versions. What is not alxia's — React Router,
 * Zod, Vite, TypeScript — comes from npm at the newest versions
 * `@alxia/create` resolves today, so this needs the network, and an upstream
 * release can turn it red with no change here. It runs in CI as the
 * `Templates` job, informational like `Newest peers`.
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
import { biomeClean } from './templates/biome';
import { CHECKS, type Check } from './templates/checks';
import { dockerRuns, dockerServed } from './templates/docker';
import { startRegistry } from './templates/registry';
import { report } from './templates/report';
import { served } from './templates/serve';
import { templateShipped } from './templates/shipped';

/** `bun create @alxia` is `bunx @alxia/create`: the same bin, run alone. */
async function helpRuns(workdir: string, env: Record<string, string>) {
	const help = await $`bunx @alxia/create --help`
		.cwd(workdir)
		.env(env)
		.nothrow()
		.quiet();
	const usage =
		help.exitCode === 0 &&
		help.stdout.toString().startsWith('Usage: bun create @alxia');
	if (!usage) console.error(help.stdout.toString(), help.stderr.toString());
	return report(usage, 'bunx @alxia/create --help');
}

/** Creates `check`'s template in `workdir`, then runs its scripts and its server. */
async function templateWorks(
	check: Check,
	workdir: string,
	env: Record<string, string>,
	registryUrl: string,
	docker: boolean,
): Promise<boolean> {
	const name = `my-${check.template}`;
	const dir = join(workdir, name);
	console.log(`\n=== bun create @alxia ${name} --template ${check.template}\n`);
	const created =
		await $`bun create @alxia ${name} --template ${check.template}`
			.cwd(workdir)
			.env(env)
			.nothrow();
	if (created.exitCode !== 0) {
		return report(
			false,
			`${check.template}: bun create exited ${created.exitCode}`,
		);
	}
	// The project's alxia packages are this checkout's, not npm's.
	const lock = await Bun.file(join(dir, 'bun.lock')).text();
	let ok = report(
		lock.includes(`${registryUrl}/-/@alxia-core-`),
		`${check.template}: @alxia/core installed from the packed tarball`,
	);
	for (const file of check.files) {
		ok &&= report(
			await Bun.file(join(dir, file)).exists(),
			`${check.template}: wrote ${file}`,
		);
	}
	console.log(
		`\n${check.template}'s package.json:\n${await Bun.file(join(dir, 'package.json')).text()}`,
	);
	for (const script of check.scripts) {
		console.log(`\n=== ${check.template}: bun run ${script}\n`);
		const run = await $`bun run ${script}`.cwd(dir).env(env).nothrow();
		ok &&= report(
			run.exitCode === 0,
			`${check.template}: bun run ${script} exited ${run.exitCode}`,
		);
	}
	ok = (await biomeClean(check.template, dir, env)) && ok;
	const status = await served(dir, env, check.request, check.env);
	ok =
		report(
			status === check.expected,
			`${check.template}: bun run start answered ${status}, expected ${check.expected}`,
		) && ok;
	if (!docker) return ok;
	console.log(`\n=== ${check.template}: docker build, docker run\n`);
	const contained = await dockerServed(
		dir,
		`alxia-template-${check.template}`,
		registryUrl,
		check.request,
		check.env,
	);
	return (
		report(
			contained === check.expected,
			`${check.template}: its Docker image answered ${contained}, expected ${check.expected}`,
		) && ok
	);
}

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
	await mkdir(join(workdir, 'tmp'));
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
	try {
		let ok = templateShipped(packed.tarballs);
		ok = (await helpRuns(workdir, env)) && ok;
		const docker = await dockerRuns();
		// CI's runners have a daemon: one missing there is a failure.
		if (!docker)
			ok = report(!process.env['CI'], 'docker: no daemon, skipped') && ok;
		for (const check of CHECKS) {
			ok =
				(await templateWorks(check, workdir, env, registry.url, docker)) && ok;
		}
		return ok;
	} finally {
		registry.stop();
		await rm(workdir, { recursive: true, force: true });
	}
}

if (import.meta.main && !(await main())) {
	process.exit(1);
}

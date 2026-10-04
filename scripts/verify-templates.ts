/**
 * Runs `bun create @alxia` as a user would, from the packed tarballs, for
 * each template, then proves the project it wrote works: it installs, its
 * `typecheck`, `test` and `build` pass, its production server answers, and,
 * where a Docker daemon answers, so does the image its `Dockerfile` builds.
 *
 * Every package is packed, and served by a registry on localhost that passes
 * every other request to npm's (`templates/registry.ts`). Bun is pointed at
 * it with `BUN_CONFIG_REGISTRY`, with an empty cache and temporary
 * directory of its own, so neither `@alxia/create` nor a package it installs
 * comes from the published versions. What is not alxia's — React Router,
 * Zod, Vite, TypeScript — comes from npm at the newest versions
 * `@alxia/create` resolves today, so this needs the network,
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
import type { Tarball } from './artifacts/tarball';
import { startRegistry } from './templates/registry';

/** A port nothing listens on, for a server this script starts. */
function freePort(): number {
	const probe = Bun.serve({ port: 0, fetch: () => new Response() });
	const { port } = probe;
	probe.stop(true);
	if (port === undefined) throw new Error('no free port');
	return port;
}

/** What `request` answers on `port` within 20 seconds, or 0. */
async function answered(
	port: number,
	request: (base: string) => Promise<Response>,
): Promise<number> {
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
		return await answered(port, request);
	} finally {
		server.kill();
		await server.exited;
	}
}

/** Whether a Docker daemon answers: CI's ubuntu runners have one. */
async function dockerRuns(): Promise<boolean> {
	const info = await $`docker info --format {{.ServerVersion}}`
		.nothrow()
		.quiet();
	return info.exitCode === 0;
}

/**
 * Builds the project's `Dockerfile`, runs the image and resolves to what
 * `request` answers from the container. `bun.lock` names the packed
 * tarballs on the registry at localhost, which is not the build's: it is
 * pointed at the host as `host.docker.internal` first, which Docker Desktop
 * resolves and `--add-host` maps on Linux. The registry listens on every
 * interface.
 */
async function dockerServed(
	dir: string,
	tag: string,
	registryUrl: string,
	request: (base: string) => Promise<Response>,
): Promise<number> {
	const lock = Bun.file(join(dir, 'bun.lock'));
	const host = registryUrl.replace('//localhost:', '//host.docker.internal:');
	await Bun.write(lock, (await lock.text()).replaceAll(registryUrl, host));
	const built =
		await $`docker build --add-host=host.docker.internal:host-gateway -t ${tag} .`
			.cwd(dir)
			.nothrow();
	if (built.exitCode !== 0) return -1;
	const port = freePort();
	const name = `${tag}-${port}`;
	try {
		const ran =
			await $`docker run -d --rm --name ${name} -p ${port}:3000 ${tag}`.nothrow();
		if (ran.exitCode !== 0) return -1;
		return await answered(port, request);
	} finally {
		await $`docker logs ${name}`.nothrow();
		await $`docker rm -f ${name}`.nothrow().quiet();
		await $`docker rmi ${tag}`.nothrow().quiet();
	}
}

interface Check {
	readonly template: 'api' | 'react-router';
	/** Files the project must hold, as a template copied them. */
	readonly files: readonly string[];
	readonly scripts: readonly string[];
	readonly request: (base: string) => Promise<Response>;
	readonly expected: number;
}

const CHECKS: readonly Check[] = [
	{
		template: 'api',
		files: [
			'.gitignore',
			'.dockerignore',
			'.env.example',
			'Dockerfile',
			'src/app.ts',
		],
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
		files: [
			'.gitignore',
			'bunfig.toml',
			'Dockerfile',
			'vite.config.ts',
			'app/root.tsx',
		],
		scripts: ['typecheck', 'build'],
		request: (base) => fetch(`${base}/`),
		expected: 200,
	},
];

/** Prints `ok` or `FAIL` and the check's name; whether it passed. */
function report(passed: boolean, what: string): boolean {
	console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
	return passed;
}

/**
 * `bun publish` leaves every `.gitignore` and `bunfig.toml` out of a
 * tarball, so the templates ship them as `gitignore` and `_bunfig.toml`,
 * renamed when they are copied.
 */
const SHIPPED: Readonly<Record<Check['template'], readonly string[]>> = {
	api: [
		'gitignore',
		'.dockerignore',
		'.env.example',
		'Dockerfile',
		'package.json',
		'src/app.ts',
	],
	'react-router': [
		'gitignore',
		'_bunfig.toml',
		'.dockerignore',
		'Dockerfile',
		'package.json',
		'vite.config.ts',
	],
};

function templateShipped(tarballs: readonly Tarball[]): boolean {
	const create = tarballs.find(
		({ manifest }) => manifest['name'] === '@alxia/create',
	);
	const entries = create?.entries ?? [];
	return Object.entries(SHIPPED).every(([template, files]) =>
		report(
			files.every((file) =>
				entries.includes(`package/templates/${template}/${file}`),
			),
			`@alxia/create's tarball holds templates/${template}: ${files.join(', ')}`,
		),
	);
}

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
	const status = await served(dir, env, check.request);
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
		if (!docker) console.log('skip docker build: no Docker daemon answers');
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

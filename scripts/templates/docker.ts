/** A template's Docker image, built and run, and what it answers. */
import { join } from 'node:path';
import { $ } from 'bun';
import { answered, freePort } from './serve';

/** Whether a Docker daemon answers: CI's ubuntu runners have one. */
export async function dockerRuns(): Promise<boolean> {
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
export async function dockerServed(
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

import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import type { Pkg } from './packages';

/** Where a package keeps the files a consumer's declaration build must name. */
export const FIXTURES = join('test', 'declarations');

/**
 * Emits the declarations of each package's `test/declarations/*.ts` against
 * the installed tarballs; false if one fails.
 *
 * A consumer that exports an app built with `onRefusal` or `group` writes a
 * declaration whose types must be named through the package's own entry. A
 * type the entry does not export fails there with TS2883 ("cannot be named
 * without a reference to …"), and only there: inside the workspace a
 * sibling resolves to its source, so tsc names it by a relative path and
 * nothing complains.
 */
export async function declarationsEmit(
	workdir: string,
	packages: readonly Pkg[],
): Promise<boolean> {
	const withFixtures = packages.filter((p) =>
		existsSync(join(p.dir, FIXTURES)),
	);
	if (withFixtures.length === 0) return true;
	console.log(
		`\nEmitting declarations for ${withFixtures.length} package(s)' fixtures…\n`,
	);
	let broken = 0;
	for (const pkg of withFixtures) {
		const dir = join(workdir, 'declarations', pkg.name.replace('/', '__'));
		await mkdir(dir, { recursive: true });
		await cp(join(pkg.dir, FIXTURES), dir, {
			recursive: true,
			filter: (source) => !source.endsWith('tsconfig.json'),
		});
		await Bun.write(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG));
		const ran =
			await $`bun --bun ${join(workdir, 'node_modules/.bin/tsc')} -p .`
				.cwd(dir)
				.quiet()
				.nothrow();
		const ok = ran.exitCode === 0;
		if (!ok) broken++;
		console.log(`  ${ok ? 'ok  ' : 'FAIL'}    ${pkg.name}`);
		if (!ok) console.log(indent(ran.stdout.toString() + ran.stderr.toString()));
	}
	if (broken > 0) {
		console.error(
			`\n${broken} package(s) leave a type a consumer's declaration cannot name.\n` +
				'Export it from the package entry; see AGENTS.md.',
		);
		return false;
	}
	console.log('\nEvery fixture emits its declarations.');
	return true;
}

/** A consumer's strictest settings, with the declaration build on. */
const TSCONFIG = {
	compilerOptions: {
		types: [],
		lib: ['ESNext', 'DOM'],
		target: 'ESNext',
		module: 'ESNext',
		moduleResolution: 'bundler',
		strict: true,
		exactOptionalPropertyTypes: true,
		noUncheckedIndexedAccess: true,
		declaration: true,
		emitDeclarationOnly: true,
		outDir: 'out',
		skipLibCheck: true,
	},
	include: ['*.ts'],
};

function indent(text: string): string {
	return text
		.trim()
		.split('\n')
		.map((line) => `            ${line}`)
		.join('\n');
}

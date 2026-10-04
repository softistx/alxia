#!/usr/bin/env bun
/**
 * `create-alxia`, the package's bin: `bun create @alxia` runs it, as do
 * `bunx @alxia/create` and `npm create @alxia`.
 */
import { main, processIo } from './main';

process.exitCode = await main(
	process.argv.slice(2),
	process.cwd(),
	processIo(),
);

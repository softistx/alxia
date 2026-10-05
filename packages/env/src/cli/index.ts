#!/usr/bin/env bun
/**
 * `alxia-env`, the package's bin: `bunx alxia-env example > .env.example`
 * writes the `.env.example` of the app's `src/env.ts`.
 */
import { main } from './main';

process.exitCode = await main(process.argv.slice(2), process.cwd(), {
	out: (line) => console.log(line),
	err: (line) => console.error(line),
});

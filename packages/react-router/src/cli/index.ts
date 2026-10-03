#!/usr/bin/env bun
/**
 * `alxia-react-router`, the package's bin: `bunx alxia-react-router reveal`
 * writes the default server into the app, to customise it.
 */
import { main } from './main';

process.exitCode = await main(process.argv.slice(2), process.cwd(), {
	out: (line) => console.log(line),
	err: (line) => console.error(line),
});

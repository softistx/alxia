import { NAME } from './entry';

/**
 * Refuses, with what to do, a dev or preview server running on Node. The
 * React Router CLI's `#!/usr/bin/env node` runs it on Node whenever a node
 * is installed, even from `bun run dev`, and alxia's server then fails on
 * its first request with `ReferenceError: Bun is not defined`.
 */
export function requireBun(
	command: string,
	hint = `bun --bun ${command}`,
	onBun = (globalThis as { Bun?: unknown }).Bun !== undefined,
	reason = "and alxia's server runs on Bun",
): void {
	if (onBun) return;
	throw new Error(
		`${NAME}: ${command} is running on Node, ${reason}. Add a bunfig.toml beside package.json with "[run]" and "bun = true", so bun run starts it on Bun, or run it as ${hint}.`,
	);
}

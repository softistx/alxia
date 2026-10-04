/** Where `create-alxia` prints, asks and runs: the process's own, or a spec's. */

export interface Io {
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
	/**
	 * An answer to `question`, `fallback` when empty; undefined when there is
	 * no terminal to ask in, null when the input ended (Ctrl-D) unanswered.
	 */
	readonly ask: (
		question: string,
		fallback: string,
	) => string | null | undefined;
	/** Runs a command in `cwd` with the terminal's streams; its exit code. */
	readonly run: (command: readonly string[], cwd: string) => Promise<number>;
	readonly env: Record<string, string | undefined>;
	/** The registry's `fetch`, for a spec's fake one. */
	readonly fetch?: (request: Request) => Promise<Response>;
}

/** The process's own `Io`: its streams, `prompt()`, `Bun.spawn`. */
export function processIo(): Io {
	return {
		out: (line) => console.log(line),
		err: (line) => console.error(line),
		ask: (question, fallback) => {
			if (!process.stdin.isTTY) return undefined;
			// Bun's prompt() prints the default as `[fallback]`, gives it for an
			// empty line, and null at the end of the input.
			const answer = prompt(question, fallback);
			return answer === null ? null : answer.trim() || fallback;
		},
		run: async (command, cwd) =>
			Bun.spawn([...command], { cwd, stdio: ['inherit', 'inherit', 'inherit'] })
				.exited,
		env: process.env,
	};
}

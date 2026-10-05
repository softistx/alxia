/**
 * An error's stack, read for the dev error page: each frame, whether it
 * is the app's own code, and a few lines of source around the first one
 * that is.
 */
import { readFileSync } from 'node:fs';

/** A frame of a stack: its text, and where it points when it names a file. */
export interface Frame {
	readonly text: string;
	readonly file?: string;
	readonly line?: number;
	/** In the app's own code: under the working directory, not in `node_modules`. */
	readonly app: boolean;
}

/** A line of source, its number, and whether the frame points at it. */
export interface SourceLine {
	readonly number: number;
	readonly text: string;
	readonly hit: boolean;
}

const LOCATION = /\(?((?:file:\/\/)?\/[^():]+):(\d+)(?::\d+)?\)?$/;

/** The frames of `stack`, the lines after its first, the message's. */
export function framesOf(stack: string, root = process.cwd()): Frame[] {
	return stack
		.split('\n')
		.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.startsWith('at '))
		.map((text) => {
			const found = LOCATION.exec(text);
			if (found === null) return { text, app: false };
			const file = (found[1] as string).replace(/^file:\/\//, '');
			const app = file.startsWith(root) && !file.includes('/node_modules/');
			return { text, file, line: Number(found[2]), app };
		});
}

/**
 * The lines around the one `frame` points at, two on each side; nothing
 * when its file cannot be read — a bundle's, a deleted one.
 */
export function sourceOf(frame: Frame, around = 2): SourceLine[] {
	if (frame.file === undefined || frame.line === undefined) return [];
	let text: string;
	try {
		text = readFileSync(frame.file, 'utf8');
	} catch {
		return [];
	}
	const lines = text.split('\n');
	const first = Math.max(1, frame.line - around);
	const last = Math.min(lines.length, frame.line + around);
	const excerpt: SourceLine[] = [];
	for (let number = first; number <= last; number++) {
		excerpt.push({
			number,
			text: lines[number - 1] as string,
			hit: number === frame.line,
		});
	}
	return excerpt;
}

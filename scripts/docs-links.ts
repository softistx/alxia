#!/usr/bin/env bun
/**
 * Fails on a link that goes nowhere: a relative link to a file that does not
 * exist, a `#anchor` no heading of the page makes, and the same for a link
 * written as this repository's GitHub URL on `develop`, which the READMEs use
 * because npm does not resolve relative links.
 *
 * It reads every Markdown file Git knows or would add (`git ls-files -co
 * --exclude-standard`), leaves code fences and code spans alone, and slugs
 * a heading as GitHub does: lowercased, anything but letters, digits,
 * spaces, `-` and `_` dropped, each space a `-`, a repeated slug suffixed
 * `-1`, `-2`. An external link is not fetched.
 *
 *   bun run check:docs
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { $ } from 'bun';
import { ROOT } from './artifacts/packages';

const REPOSITORY = 'https://github.com/softistx/alxia/';

/** Markdown with its code fences blanked, line for line. */
export function withoutFences(markdown: string): string {
	let fence: string | null = null;
	return markdown
		.split('\n')
		.map((line) => {
			const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
			if (fence === null) {
				if (marker !== undefined) fence = marker[0] ?? null;
				return marker === undefined ? line : '';
			}
			if (marker !== undefined && marker[0] === fence) fence = null;
			return '';
		})
		.join('\n');
}

/** What GitHub shows of a heading's source: no code ticks, link targets or emphasis. */
function rendered(heading: string): string {
	return heading
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.split(/(`+[^`]*`+)/)
		.map((part, index) =>
			// the odd parts are code spans: their text is kept as written, `<T>` included
			index % 2 === 1
				? part.replace(/`/g, '')
				: part.replace(/<[^>]+>/g, '').replace(/\*/g, ''),
		)
		.join('')
		.trim();
}

/** The anchor GitHub makes of one heading's text, before any `-1` suffix. */
export function slug(heading: string): string {
	return rendered(heading)
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
		.replace(/ /g, '-');
}

/** Every anchor a page offers: its headings, and its `id`s. */
export function anchorsOf(markdown: string): Set<string> {
	const anchors = new Set<string>();
	const seen = new Map<string, number>();
	const text = withoutFences(markdown);
	for (const [, heading] of text.matchAll(
		/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/gm,
	)) {
		const base = slug(heading ?? '');
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		anchors.add(count === 0 ? base : `${base}-${count}`);
	}
	for (const [, id] of text.matchAll(/\bid="([^"]+)"/g)) anchors.add(id ?? '');
	return anchors;
}

export interface Link {
	readonly line: number;
	readonly target: string;
}

/** Every `[text](target)` and `[ref]: target` outside code. */
export function linksOf(markdown: string): Link[] {
	const links: Link[] = [];
	withoutFences(markdown)
		.split('\n')
		.forEach((raw, index) => {
			const line = raw.replace(/`+[^`]*`+/g, (span) => ' '.repeat(span.length));
			for (const [, target] of line.matchAll(
				/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g,
			)) {
				links.push({ line: index + 1, target: target ?? '' });
			}
			const definition =
				/^ {0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/.exec(line);
			if (definition?.[1] !== undefined) {
				links.push({ line: index + 1, target: definition[1] });
			}
		});
	return links;
}

/** A link's file and anchor, or null for one this check does not follow. */
export function localTarget(
	from: string,
	target: string,
): { file: string; anchor: string } | null {
	const [address = '', anchor = ''] = target.split('#');
	const [location = ''] = address.split('?');
	let file: string;
	if (/^https?:\/\//.test(target)) {
		const inRepository = /^(blob|tree)\/develop\/?/;
		if (
			!address.startsWith(REPOSITORY) ||
			!inRepository.test(address.slice(REPOSITORY.length))
		) {
			return null;
		}
		file = join(
			ROOT,
			location.slice(REPOSITORY.length).replace(inRepository, ''),
		);
	} else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
		return null;
	} else {
		file = location === '' ? from : resolve(dirname(from), location);
	}
	try {
		return { file, anchor: decodeURIComponent(anchor) };
	} catch {
		return { file, anchor }; // a malformed %-escape: no heading makes it, and it is reported
	}
}

/** Every broken link of one Markdown file, as `path:line: message`. */
export function problemsOf(
	from: string,
	markdown: string,
	anchorsFor: (file: string) => Set<string> | null,
): string[] {
	const problems: string[] = [];
	for (const { line, target } of linksOf(markdown)) {
		const local = localTarget(from, target);
		if (local === null) continue;
		const where = `${relative(ROOT, from)}:${line}`;
		if (!existsSync(local.file)) {
			problems.push(`${where}: ${target} -> no such file`);
			continue;
		}
		if (
			local.anchor === '' ||
			!local.file.endsWith('.md') ||
			statSync(local.file).isDirectory()
		) {
			continue;
		}
		const anchors = anchorsFor(local.file);
		if (anchors !== null && !anchors.has(local.anchor)) {
			problems.push(`${where}: ${target} -> no heading makes #${local.anchor}`);
		}
	}
	return problems;
}

async function main(): Promise<void> {
	const listed = await $`git ls-files -co --exclude-standard -- '*.md'`
		.cwd(ROOT)
		.text();
	const files = listed
		.split('\n')
		.filter(Boolean)
		.filter((file) => existsSync(join(ROOT, file)));
	const anchorCache = new Map<string, Set<string>>();
	const anchorsFor = (file: string): Set<string> | null => {
		const cached = anchorCache.get(file);
		if (cached !== undefined) return cached;
		const anchors = anchorsOf(readFileSync(file, 'utf8'));
		anchorCache.set(file, anchors);
		return anchors;
	};
	const problems: string[] = [];
	for (const file of files) {
		const path = join(ROOT, file);
		problems.push(...problemsOf(path, await Bun.file(path).text(), anchorsFor));
	}
	if (problems.length > 0) {
		console.error(problems.join('\n'));
		console.error(
			`\n${problems.length} broken link(s) in ${files.length} Markdown files.`,
		);
		process.exit(1);
	}
	console.log(
		`${files.length} Markdown files: no broken relative link or anchor.`,
	);
}

if (import.meta.main) await main();

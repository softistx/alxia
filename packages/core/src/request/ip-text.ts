/**
 * An address's one canonical text, so one client is one string in a
 * rate-limit key, a log line or an allow list, however a header or a
 * socket wrote it: IPv4 dotted decimal, IPv6 as RFC 5952 §4 writes it.
 */

/** IPv4 as dotted decimal, no leading zeros: `192.0.2.1`. */
export function ipv4Text(value: bigint): string {
	const n = Number(value);
	return `${n >>> 24}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

/** The longest run of two or more zero groups, the first of equal ones: what `::` stands for. */
function zeroRun(groups: readonly bigint[]): { at: number; length: number } {
	let best = { at: -1, length: 0 };
	let start = -1;
	for (let at = 0; at <= groups.length; at++) {
		if (at < groups.length && groups[at] === 0n) {
			if (start < 0) start = at;
			continue;
		}
		const length = start < 0 ? 0 : at - start;
		if (length >= 2 && length > best.length) best = { at: start, length };
		start = -1;
	}
	return best;
}

/**
 * IPv6 as RFC 5952 §4 writes it: lowercase hex, no leading zeros, the
 * longest run of two or more zero groups (the first of equal ones) as
 * `::`, a single zero group as `0`: `2001:db8::1`.
 */
export function ipv6Text(value: bigint): string {
	const groups = [112n, 96n, 80n, 64n, 48n, 32n, 16n, 0n].map(
		(shift) => (value >> shift) & 0xffffn,
	);
	const hex = (part: readonly bigint[]) =>
		part.map((group) => group.toString(16)).join(':');
	const run = zeroRun(groups);
	if (run.at < 0) return hex(groups);
	const head = hex(groups.slice(0, run.at));
	const tail = hex(groups.slice(run.at + run.length));
	return `${head}::${tail}`;
}

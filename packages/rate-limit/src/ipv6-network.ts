/** The eight 16-bit groups of an IPv6 address, or `undefined` when `text` is not one. */
function groupsOf(text: string): number[] | undefined {
	const zone = text.indexOf('%');
	const address = zone === -1 ? text : text.slice(0, zone);
	const halves = address.split('::');
	if (halves.length > 2 || !address.includes(':')) return undefined;
	const read = (half: string | undefined): string[] | undefined =>
		half === undefined || half === '' ? [] : half.split(':');
	const head = read(halves[0]) ?? [];
	const tail = read(halves[1]) ?? [];
	const written = [...head, ...tail];
	const last = written[written.length - 1];
	if (last?.includes('.')) {
		// The dotted form ends the address: `1.2.3.4::` is not one.
		if (!address.endsWith(last)) return undefined;
		const octets = last.split('.');
		const bytes = octets.map((octet) =>
			/^\d{1,3}$/.test(octet) ? Number(octet) : Number.NaN,
		);
		if (bytes.length !== 4 || bytes.some((byte) => !(byte <= 255)))
			return undefined;
		const [a = 0, b = 0, c = 0, d = 0] = bytes;
		written.splice(
			-1,
			1,
			((a << 8) | b).toString(16),
			((c << 8) | d).toString(16),
		);
		if (tail.length > 0) tail.splice(-1, 1, 'x', 'x');
		else head.splice(-1, 1, 'x', 'x');
	}
	const compressed = halves.length === 2;
	const missing = 8 - written.length;
	if (compressed ? missing < 1 : missing !== 0) return undefined;
	const all = compressed
		? [
				...written.slice(0, head.length),
				...new Array<string>(missing).fill('0'),
				...written.slice(head.length),
			]
		: written;
	const groups = all.map((group) =>
		/^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN,
	);
	return groups.some(Number.isNaN) ? undefined : groups;
}

/** RFC 5952: the longest run of two or more zero groups (the first on a tie) as `::`. */
function written(groups: readonly number[]): string {
	let start = -1;
	let length = 0;
	for (let i = 0; i < 8; ) {
		if (groups[i] !== 0) {
			i++;
			continue;
		}
		let end = i;
		while (end < 8 && groups[end] === 0) end++;
		if (end - i > length) {
			start = i;
			length = end - i;
		}
		i = end;
	}
	const hex = (list: readonly number[]) =>
		list.map((group) => group.toString(16)).join(':');
	if (length < 2) return hex(groups);
	return `${hex(groups.slice(0, start))}::${hex(groups.slice(start + length))}`;
}

/**
 * The network of an IPv6 `address` under `prefix` bits, as `2001:db8:1:2::/64`
 * writes it. An IPv4-mapped address (`::ffff:203.0.113.9`) is its IPv4 address,
 * a zone id (`%eth0`) is dropped, and a text that is not an IPv6 address
 * (an IPv4 one included) is returned as it is.
 */
export function ipv6Network(address: string, prefix: number): string {
	const groups = groupsOf(address);
	if (groups === undefined) return address;
	if (
		groups.slice(0, 5).every((group) => group === 0) &&
		groups[5] === 0xffff
	) {
		const [a = 0, b = 0] = groups.slice(6);
		return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
	}
	const masked = groups.map((group, index) => {
		const kept = Math.min(16, Math.max(0, prefix - index * 16));
		return (group >> (16 - kept)) << (16 - kept);
	});
	return `${written(masked.map((group) => group & 0xffff))}/${prefix}`;
}

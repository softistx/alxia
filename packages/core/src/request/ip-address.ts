import { isIP } from 'node:net';

/** An IP address as a number, with its family: an IPv4-mapped IPv6 address is read as IPv4. */
export interface ParsedIp {
	readonly version: 4 | 6;
	readonly value: bigint;
	/** The address without port or brackets, lowercase. */
	readonly text: string;
}

function ipv4(text: string): bigint {
	let value = 0n;
	for (const part of text.split('.')) value = (value << 8n) | BigInt(part);
	return value;
}

function ipv6(text: string): bigint {
	let address = text;
	const tail = address.slice(address.lastIndexOf(':') + 1);
	if (tail.includes('.')) {
		const v4 = ipv4(tail);
		address = `${address.slice(0, -tail.length)}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
	}
	const [head = '', rest, extra] = address.split('::');
	if (extra !== undefined) throw new Error('two ::');
	const front = head === '' ? [] : head.split(':');
	const back = rest === undefined || rest === '' ? [] : rest.split(':');
	const zeros = rest === undefined ? 0 : 8 - front.length - back.length;
	let value = 0n;
	for (const group of [...front, ...Array(zeros).fill('0'), ...back])
		value = (value << 16n) | BigInt(`0x${group}`);
	return value;
}

/**
 * An address as an entry of a forwarding header or a socket gives it: IPv4
 * or IPv6, IPv6 optionally in brackets, either with an optional port.
 * `undefined` for anything else (`unknown`, `_hidden`, a name, an empty entry).
 */
export function parseIp(entry: string): ParsedIp | undefined {
	let text = entry.trim();
	const bracket = /^\[([^\]]*)\](?::\d{1,5})?$/.exec(text);
	if (bracket) text = bracket[1] ?? '';
	else if (/^\d+\.\d+\.\d+\.\d+:\d{1,5}$/.test(text))
		text = text.slice(0, text.lastIndexOf(':'));
	if (text.includes('%')) return undefined; // a zone id names an interface, not a client
	const family = isIP(text);
	if (family === 4) return { version: 4, value: ipv4(text), text };
	if (family !== 6) return undefined;
	const value = ipv6(text);
	if (value >> 32n === 0xffffn)
		return { version: 4, value: value & 0xffffffffn, text: text.toLowerCase() };
	return { version: 6, value, text: text.toLowerCase() };
}

/** A CIDR range, or one address: `10.0.0.0/8`, `fd00::/8`, `192.168.1.1`. Throws on anything else. */
export function parseCidr(range: string): (address: ParsedIp) => boolean {
	const [base = '', bits, extra] = range.split('/');
	const network = parseIp(base);
	const bad = () =>
		new Error(`forwardedIp: "${range}" is not an IP address or a CIDR range`);
	if (network === undefined || extra !== undefined || base.includes(']'))
		throw bad();
	// A range written as an IPv4-mapped IPv6 address counts its prefix in IPv6 bits.
	const mapped = network.version === 4 && base.includes(':');
	const size = network.version === 4 && !mapped ? 32 : 128;
	if (bits !== undefined && !/^\d{1,3}$/.test(bits)) throw bad();
	const prefix = bits === undefined ? size : Number(bits);
	const length = mapped ? prefix - 96 : prefix;
	if (prefix > size || length < 0) throw bad();
	const shift = BigInt((mapped ? 32 : size) - length);
	return (address) =>
		address.version === network.version &&
		address.value >> shift === network.value >> shift;
}

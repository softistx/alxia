import { isIP } from 'node:net';
import { ipv4Text, ipv6Text } from './ip-text';

/** An IP address as a number, with its family: an IPv4-mapped IPv6 address is read as IPv4. */
export interface ParsedIp {
	readonly version: 4 | 6;
	readonly value: bigint;
	/** The address without port or brackets, lowercase. */
	readonly text: string;
}

/** Its one canonical text: IPv4 dotted, IPv6 as RFC 5952 writes it, a mapped address as IPv4. */
export function canonicalOf(ip: ParsedIp): string {
	return ip.version === 4 ? ipv4Text(ip.value) : ipv6Text(ip.value);
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
	const text = unwrapped(entry);
	if (text.includes('%')) return undefined; // a zone id names an interface, not a client
	return parsed(text);
}

/** An entry without its brackets and its port. */
function unwrapped(entry: string): string {
	const text = entry.trim();
	const bracket = /^\[([^\]]*)\](?::\d{1,5})?$/.exec(text);
	if (bracket) return bracket[1] ?? '';
	if (/^\d+\.\d+\.\d+\.\d+:\d{1,5}$/.test(text))
		return text.slice(0, text.lastIndexOf(':'));
	return text;
}

/** A bare address, read; `undefined` for anything else. */
function parsed(text: string): ParsedIp | undefined {
	const family = isIP(text);
	if (family === 4) {
		return { version: 4, value: ipv4(text), text };
	}
	if (family !== 6) return undefined;
	const value = ipv6(text);
	const lower = text.toLowerCase();
	if (value >> 32n === 0xffffn)
		return { version: 4, value: value & 0xffffffffn, text: lower };
	return { version: 6, value, text: lower };
}

/** IPv4, bare or mapped into IPv6. */
const DOTTED = /^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/**
 * The one text of an address, however a header or a socket wrote it, so
 * one client is one string in a rate-limit key, a log or an allow list:
 * brackets and a port dropped, IPv6 as RFC 5952 writes it (lowercase, no
 * leading zeros, the longest zero run as `::`), an IPv4-mapped address
 * (`::ffff:192.0.2.1`) as IPv4. A zone id (`fe80::1%en0`) is kept, as
 * written, after the canonical IPv6 address it qualifies. What is no
 * address comes back as given.
 *
 * @example
 * canonicalIp('[2001:DB8:0:0:0:0:0:1]:443'); // '2001:db8::1'
 * canonicalIp('::ffff:192.0.2.1'); // '192.0.2.1'
 */
export function canonicalIp(address: string): string {
	// What a socket gives most: IPv4, or IPv4 mapped, read without a parse.
	const v4 = DOTTED.exec(address)?.[1];
	if (v4 !== undefined && isIP(v4) === 4) return v4;
	const text = unwrapped(address);
	const zone = text.indexOf('%');
	if (zone < 0) {
		const ip = parsed(text);
		return ip === undefined ? address : canonicalOf(ip);
	}
	const ip = parsed(text.slice(0, zone));
	if (ip === undefined || zone === text.length - 1 || !text.includes(':'))
		return address;
	const at =
		ip.version === 4 ? `::ffff:${ipv4Text(ip.value)}` : canonicalOf(ip);
	return `${at}${text.slice(zone)}`;
}

/** A CIDR range, or one address: `10.0.0.0/8`, `fd00::/8`, `192.168.1.1`. Throws on anything else. */
export function parseCidr(
	range: string,
	who = 'forwardedIp',
): (address: ParsedIp) => boolean {
	const [base = '', bits, extra] = range.split('/');
	const network = parseIp(base);
	const bad = () =>
		new Error(`${who}: "${range}" is not an IP address or a CIDR range`);
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

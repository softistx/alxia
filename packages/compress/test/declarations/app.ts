// An app behind compression, behind exported functions whose return types
// are inferred: a declaration build must be able to name each one through
// `@alxia/compress` and `@alxia/core` alone (TS2883 otherwise).
import { compress, type Encoding, negotiate } from '@alxia/compress';
import { alxia } from '@alxia/core';

export function compressed() {
	return alxia()
		.use(compress({ encodings: ['br', 'gzip'], threshold: 512 }))
		.get('/', ({ reply }) => reply(200, { items: ['a', 'b'] }));
}

export function compressor(encodings: readonly Encoding[]) {
	return compress({ encodings, compressible: (type) => type !== 'image/png' });
}

export function chosen(accept: string | null) {
	return negotiate(accept, ['zstd', 'gzip']);
}

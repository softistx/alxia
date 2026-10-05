# File uploads

**The problem.** A client sends a file, alone or with fields beside it, and
you want the file validated (its size, its type), the whole request capped
so a client cannot fill the disk or the memory, and the file stored under a
name you chose.

`@alxia/core` reads a `multipart/form-data` body for you: a route that is
given `validate({ body })` receives an object of the form's fields, a field
sent once as a value, one sent more than once as an array, and a file as a
`File`. A `body` schema checks it as it checks JSON. What the core does not
do is store the file: that is `Bun.write`, which is all it needs. There is no
streaming multipart parser: the form is read whole, so cap it
([the limit](#cap-the-request)), and send a very large file as a raw
`PUT` body, read as a stream ([below](#a-large-file-as-a-raw-body)).

```sh
bun add @alxia/core zod
```

## One file and its fields

```ts
// file: src/app.ts
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia, responds, validate } from '@alxia/core';
import { z } from 'zod';

const UPLOADS = Bun.env['UPLOAD_DIR'] ?? join(tmpdir(), 'alxia-uploads');
await mkdir(UPLOADS, { recursive: true });

const MAX_AVATAR = 1024 * 1024; // 1 MiB
const AVATAR_TYPES = ['image/png', 'image/jpeg'];

const Avatar = z.object({
	owner: z.string().min(1), // a text field of the form
	file: z
		.instanceof(File)
		.refine((file) => file.size > 0, 'The file is empty')
		.refine((file) => file.size <= MAX_AVATAR, 'The file is over 1 MiB')
		.refine((file) => AVATAR_TYPES.includes(file.type), 'Send a PNG or a JPEG'),
});

export const app = alxia({ errors: 'problem' })
	.bodyLimit(2 * 1024 * 1024) // every route after it: 2 MiB, the form's overhead included
	.post(
		'/avatars',
		validate({ body: Avatar }),
		responds({ 201: z.object({ id: z.string(), bytes: z.number() }) }),
		async ({ body, reply }) => {
			// Your name for it, never the client's: `../../etc/passwd` is a valid file name.
			const id = crypto.randomUUID();
			await Bun.write(join(UPLOADS, id), body.file);
			return reply(201, { id, bytes: body.file.size });
		},
	)
	.get('/avatars/:id', async ({ params, reply }) => {
		const stored = Bun.file(join(UPLOADS, params.id.replace(/[^a-f0-9-]/g, '')));
		return (await stored.exists()) ? reply(200, stored) : reply(404, { error: 'not_found' as const });
	});
```

A request the schema refuses is answered with a 400 that names every issue,
by the path of the field (`file` here), before the handler runs, and a body
past the cap is a 413: both are RFC 9457 problems under
`errors: 'problem'`.

Several files in one field arrive as an array when there are two or more,
and as a single `File` when there is one, so a field that takes a list takes
both:

```ts
// file: src/many.ts
import { z } from 'zod';

const File1 = z.instanceof(File);

// `files` sent once is a File, sent twice an array of Files.
export const Photos = z.object({
	files: z.union([File1.transform((one) => [one]), z.array(File1)]),
});
```

## Cap the request

Three levels, from the widest:

| Cap | Where | Applies to |
| --- | --- | --- |
| `maxRequestBodySize` | `listen({ maxRequestBodySize })` | every body the server takes, before routing |
| `app.bodyLimit(bytes)` | the app, or a group | every route declared after it |
| `{ bodyLimit }` | one route's options | that route, over the app's |

The cap is checked on the declared `Content-Length` first, so a client that
announces a 10 GiB body is refused without a byte read, and counted as the
bytes arrive, for a chunked upload or a false length: the read stops at the
first chunk that passes the limit, whoever reads the body. The answer is a
413, `{ "error": "content_too_large", "limit": 2097152 }`, or its problem.

```ts
// file: src/app.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

// 1x1 PNG
const PNG = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='),
	(char) => char.charCodeAt(0),
);

const form = (file: File, owner = 'ada') => {
	const body = new FormData();
	body.set('owner', owner);
	body.set('file', file);
	return body;
};

test('stores a PNG and serves it back', async () => {
	const response = await app.request('/avatars', {
		method: 'POST',
		body: form(new File([PNG], 'me.png', { type: 'image/png' })),
	});
	expect(response.status).toBe(201);
	const { id, bytes } = (await response.json()) as { id: string; bytes: number };
	expect(bytes).toBe(PNG.byteLength);
	const stored = await app.request(`/avatars/${id}`);
	expect(new Uint8Array(await stored.arrayBuffer())).toEqual(PNG);
});

test('a text file is a 400 naming the field', async () => {
	const response = await app.request('/avatars', {
		method: 'POST',
		body: form(new File(['not an image'], 'me.txt', { type: 'text/plain' })),
	});
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ issues: [{ target: 'body', path: ['file'] }] });
});

test('a body past the cap is a 413 problem', async () => {
	const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', { type: 'image/png' });
	const response = await app.request('/avatars', { method: 'POST', body: form(big) });
	expect(response.status).toBe(413);
	expect(response.headers.get('content-type')).toBe('application/problem+json');
});
```

## A large file as a raw body

When a file is too large to hold in memory, send it as the request's body, not
as a form, and read it as a stream. The handler's `request.body` is a
`ReadableStream` that fails once the route's `bodyLimit` passes, so the cap
holds without buffering:

```ts
// file: src/stream.ts
import { join } from 'node:path';
import { alxia } from '@alxia/core';

export const streaming = alxia().put(
	'/backups/:name',
	{ bodyLimit: 5 * 1024 * 1024 * 1024 }, // 5 GiB, for this route only
	async ({ request, reply }) => {
		const id = crypto.randomUUID();
		await Bun.write(join(Bun.env['UPLOAD_DIR'] ?? '/tmp', id), request); // streamed to the disk
		return reply(201, { id });
	},
);
// listen({ maxRequestBodySize }) must be at least as large: it caps the server first.
```

```ts
// file: src/stream.spec.ts
import { expect, test } from 'bun:test';
import { streaming } from './stream';

test('a raw body is written as it arrives', async () => {
	const response = await streaming.request('/backups/db', { method: 'PUT', body: 'a dump' });
	expect(response.status).toBe(201);
	const { id } = (await response.json()) as { id: string };
	expect(await Bun.file(`/tmp/${id}`).text()).toBe('a dump');
});
```

`Bun.write(path, request)` writes the body as it arrives. Do not use
`request.formData()` or `request.arrayBuffer()` for it: they read it whole.

## Reference

- [Routes and validation](../../packages/core/docs/guide/routes.md#bodies):
  how a body is read by its `content-type`, `parser` for another type, and
  [`bodyLimit`](../../packages/core/docs/guide/routes.md#body-size-bodylimit)
- [Serving](../../packages/core/docs/guide/serving.md): `maxRequestBodySize`
- [Errors as problem details](errors.md); a 413 in your own format with
  `refusalOf`
- [`@alxia/core` troubleshooting](../../packages/core/docs/troubleshooting.md)
- A spec-first upload: declare `multipart/form-data` in the document
  ([spec-first CRUD](spec-first-crud.md))

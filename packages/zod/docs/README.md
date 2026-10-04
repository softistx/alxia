# @alxia/zod documentation

The [package README](../README.md) is the short version. This folder is
the long one: what each coercion accepts and refuses, what a client may send
for it, what `zodConverter` gives as JSON Schema, and what to do
when a request a client typed is still answered with a `400`.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | reading a number, a boolean, a date, a list or a JSON filter from the path, the query string, a header or a cookie; converting Zod schemas to JSON Schema for a hand-written OpenAPI document; or testing a route that does both |
| [Troubleshooting](troubleshooting.md) | a request is refused with a `400` and you have its issue message, `tsc` refused a `zq` call, or a Zod schema will not convert to JSON Schema |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

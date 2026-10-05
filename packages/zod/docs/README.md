# @alxia/zod documentation

The [package README](../README.md) is the short version. This folder is
the long one: what each coercion accepts and refuses, what a client may send
for it, and what to do
when a request a client typed is still answered with a `400`.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | reading a number, a boolean, a date, a list or a JSON filter from the path, the query string, a header or a cookie; or testing a route that reads them |
| [Troubleshooting](troubleshooting.md) | a request is refused with a `400` and you have its issue message, `tsc` refused a `zq` call |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [File uploads](https://github.com/softistx/alxia/blob/develop/docs/recipes/file-uploads.md): multipart through `validate`, body limits, a stored file
- [A spec-first CRUD API](https://github.com/softistx/alxia/blob/develop/docs/recipes/spec-first-crud.md): `openapi.yaml` to routes, `matchesSpec`, a typed test client and `apiDocs`

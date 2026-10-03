# @alxia/openapi documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [The document](guide/document.md) | building the document with `openapi`, setting `info`, `servers` or `exclude`, writing it to a file at build time, or checking it in a test |
| [How a route is documented](guide/routes.md) | wondering what a `params`, `query`, `body`, `response` or `detail` becomes in the document, where the 400 and 500 come from, or how an operation id is made |
| [Schemas and converters](guide/converters.md) | a schema shows up as `{}`, a `Date` needs to be a `date-time` string, or you use a validator that carries no JSON Schema |
| [From an OpenAPI document](guide/from-a-document.md) | starting from the contract: generating the routes' schemas with `@nxgt/openapi-codegen`, declaring them with `app.route()`, and checking every operation has a route with `@alxia/openapi-routes` |
| [Serving the document and its page](guide/serving.md) | serving `/openapi.json` and a reference page with `docs`, moving or turning them off, or keeping them behind a guard |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or the document says less than your routes do |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

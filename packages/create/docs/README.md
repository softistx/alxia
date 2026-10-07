# @alxia/create documentation

The [package README](../README.md) is the short version. This folder is the
long one: what each of the four templates (`minimal`, `api`, `graphql`,
`react-router`) writes, how the `api` project grows from its OpenAPI
document and the `graphql` one from its schema, what the `react-router`
template adds to React Router's own, how the versions are chosen, and the
errors the command and a new project print.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | choosing a template, reading what it wrote, adding an operation to the `api` project's `openapi.yaml` or a field to the `graphql` project's `schema.graphql`, linting and formatting it with Biome, building its Docker image, pinning or moving versions, or running the command in a script or CI |
| [Troubleshooting](troubleshooting.md) | the command refused a directory, a template or an option, the registry did not answer or lacked a version, `bun install` failed, Biome refused to run in a project, or the `api` or `graphql` project's `generate --check`, an `api` `matchesSpec` or reply check, an `api` test's `ValidationError` or `UndeclaredStatusError`, or a `graphql` schema import failed |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Start in 5 minutes](https://github.com/softistx/alxia/blob/develop/docs/start.md): a first app, from `bun create @alxia` to Docker
- [A spec-first CRUD API](https://github.com/softistx/alxia/blob/develop/docs/recipes/spec-first-crud.md): `openapi.yaml` to routes, `matchesSpec`, a typed test client and `apiDocs`
- [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md): typed resolvers, a viewer, subscriptions, GraphiQL, auth errors and the drain
- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`

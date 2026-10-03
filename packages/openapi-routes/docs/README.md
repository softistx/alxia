# @alxia/openapi-routes documentation

The [package README](../README.md) is the short version. This folder is
the long one: where to call the checks, how an operation is matched to a
route, and what to do with each message they throw.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | calling `implemented` or `exactly` in a test or at startup, checking an app with a prefix, or choosing what `exactly` leaves out |
| [Troubleshooting](troubleshooting.md) | a check threw and you have its message, or it passes when you expected it to fail |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

The whole flow, from an OpenAPI document to the generated operations, the
routes and these checks, is
[From an OpenAPI document](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/from-a-document.md), in
`@alxia/openapi`'s docs.

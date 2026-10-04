# @alxia/janus documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Sessions](guide/sessions.md) | reading who a request belongs to, requiring a session, narrowing to one user type, placing the sign-in routes before the required ones, knowing where the token is read from and when a renewed cookie is sent, or testing a signed-in route |
| [Signing in and out](guide/sign-in-and-out.md) | setting the session cookie with `ctx.auth.send` after a sign-up or a sign-in, handling a second factor, signing out, remembering devices with the device cookie, or doing any of it outside a route |
| [Errors](guide/errors.md) | answering janus's refusals with their status and a safe body, knowing which code is which status, reporting the 5xx, or reading a refusal on the wire |
| [Permissions](guide/permissions.md) | guarding routes with a permission on an object, loading it by a path parameter, passing a condition's context, checking for another subject than the session's user, or reading what an earlier plugin added |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a request is anonymous, refused or a 404 when you did not expect it |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

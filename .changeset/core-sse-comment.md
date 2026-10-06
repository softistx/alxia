---
'@alxia/core': minor
---

Let a handler yield a comment on an event stream: `yield sseComment('connected')` writes `: connected`, one `:` line per line of the text, on a named or an unnamed stream, never checked by its schema. A line break cannot end the comment and start an event. The keep-alive is unchanged.

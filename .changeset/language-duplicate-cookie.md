---
'@alxia/language': patch
---

A language cookie sent twice (set on two paths or domains) is now read in full: the `cookie` source returns the first supported value among all copies, so an empty or unsupported first copy (`language=; language=fr`) no longer hides a supported second one. A single cookie behaves as before, and when no copy is supported the next source decides.

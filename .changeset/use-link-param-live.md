---
'@alxia/react-router': minor
---

`useLinkParam(name, { live: true })` follows the URL instead of reading the parameter once, so a parameter that a redirect or a link adds to the same mounted route (`?state=linked` after a mail-link action) is seen. Without `drop` it returns the parameter of the current location. With `drop` the value is kept after the address bar loses it, until a location carries a new one, and each new location is dropped again. Additive: the default stays a single read of the first render. `LinkParamOptions` gains `live?: boolean`.

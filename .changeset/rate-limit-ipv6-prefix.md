---
'@alxia/rate-limit': minor
---

`rateLimit({ ipv6Prefix: 64 })` counts an IPv6 client by its network (`2001:db8:1:2::/64`) instead of its address, so a subscriber holding a whole /64 cannot dodge the limit by changing address. IPv4 and IPv4-mapped addresses keep their key, and without the option every key is the address, as before. The option takes a whole number from 0 to 128 and applies to the default key: `rateLimit()` throws when it is given with a `key` of your own.

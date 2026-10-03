---
'@alxia/i18n': patch
---

`KeyOf` reads a catalogue's keys nine levels deep at most, where `@nxgt/i18n`'s `Path` recursed without a bound: a function generic over its catalogues can hand them to `createI18n` without TS2589 ("Type instantiation is excessively deep and possibly infinite"). A section nested deeper gives `section.${string}`.

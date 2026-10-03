# @alxia/language

The request's language for [alxia](https://www.npmjs.com/package/@alxia/core),
typed as the languages you support — never a string a client made up. No
dependency.

```sh
bun add @alxia/language @alxia/core
bun add -d typescript
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { language } from '@alxia/language';

const supported = ['en', 'fr', 'pt-BR'] as const;
const greetings: Record<(typeof supported)[number], string> = { en: 'Hello', fr: 'Bonjour', 'pt-BR': 'Olá' };

const app = alxia()
	.use(language({ supported, fallback: 'en' }))
	.get('/', ({ language, reply }) => reply(200, greetings[language])); // 'en' | 'fr' | 'pt-BR'

app.listen(3000);
```

It reads, in `order`:

| source | |
| --- | --- |
| `query` | `?lang=fr` |
| `cookie` | `language=fr` |
| `path` | `/fr/products`, at `pathIndex` |
| `header` | `Accept-Language`, by weight: `de, fr-CA;q=0.8` is `fr` |

then `resolve(ctx)` — a user's saved preference — then `fallback`. A tag
matches whatever its case, by its base language (`fr-CA` for `fr`), or by a
region of it (`pt` for `pt-BR`). `languageSource` says which source decided.

Every response says `Content-Language`, and `Vary` by the headers it read.
With `persist`, a language the query named is kept in the cookie.

## Reading the app's context

Annotate `resolve`'s parameter to decide by what an earlier plugin added —
the language a signed-in user saved. The plugin then requires it: an app
that does not give `user` before it cannot use it.

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { language } from '@alxia/language';

const byUser = language({
	supported: ['en', 'fr'],
	fallback: 'en',
	order: ['query', 'cookie'],
	resolve: ({ user }: BaseContext & { user: { language: string } | null }) => user?.language,
});

alxia().use(auth).use(byUser); // auth derives user
alxia().use(byUser); // a compile error: this app gives no `user`
```

## Options

| option | default | |
| --- | --- | --- |
| `supported` | required | the languages: `language`'s type |
| `fallback` | required | one of them; the types refuse another |
| `order` | `['query', 'cookie', 'header']` | |
| `query`, `cookie` | `lang`, `language` | their names |
| `pathIndex` | 0 | |
| `persist` | `false` | `true`, or `{ maxAge, secure }` |
| `contentLanguage` | `true` | |
| `resolve` | none | `(ctx) => string \| undefined`; annotate `ctx` to read what an earlier plugin adds |
| `vary` | none | the headers `resolve` reads, added to `Vary` |

## API

| export | |
| --- | --- |
| `language(options)` | the plugin: `language`, `languageSource` |
| `LanguageOptions` | its options: `supported`, `fallback`, `order`, `query`, `cookie`, `pathIndex`, `persist`, `contentLanguage`, `resolve`, `vary` |
| `negotiate(header, supported)` | the supported language `Accept-Language` prefers |
| `parseAcceptLanguage(header)`, `match(tag, supported)` | its parts |
| `LanguageContext`, `LanguageSource`, `Accepted` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/language/docs): every option with its default and an example, how the language is found and `Accept-Language` negotiated, the typed context, and the headers the plugin adds.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/language/docs/troubleshooting.md): an error, or a response in the wrong language, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/language/docs/roadmap.md): what is coming, and what is not planned.

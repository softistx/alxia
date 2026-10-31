# Troubleshooting

- [`module "x" is registered twice`](#module-x-is-registered-twice)
- [`module "x" depends on "y", which is not registered`](#module-x-depends-on-y-which-is-not-registered)
- [`dependency cycle: a -> b -> a`](#dependency-cycle-a---b---a)
- [`collection "x" is declared by two modules`](#collection-x-is-declared-by-two-modules)
- [`text (en) "k" is declared by two modules`](#text-en-k-is-declared-by-two-modules)
- [`module boundaries broken`](#module-boundaries-broken)
- [`Property 'x' does not exist on type ModuleMongo`](#property-x-does-not-exist-on-type-modulemongo)
- [`Type '"x"' does not satisfy the constraint` on `ModuleMongo<'x'>`](#type-x-does-not-satisfy-the-constraint-on-modulemongox)
- [`ModuleHandle` rejects my handle](#modulehandle-rejects-my-handle)

## `module "x" is registered twice`

Two manifests share a `name`, often one module listed twice in the registry
array. List each once.

## `module "x" depends on "y", which is not registered`

`dependsOn` names a module absent from the list given to `resolveModules`.
Add `y` to the list or fix the spelling.

## `dependency cycle: a -> b -> a`

Modules depend on each other. Move what both need into a third module, or
into infrastructure outside the modules, and have both depend on it.

## `collection "x" is declared by two modules`

The message ends with the two modules, `("a" and "b")`. (Also `core collection "x"`.) Two modules declare the same collection name.
Rename one; prefixing names with their module (`notes_items`) avoids it.

## `text (en) "k" is declared by two modules`

Two modules give the same key for a locale; the message ends with them, `("x" and "y")`. Prefix keys with the module name.

## `module boundaries broken`

`assertBoundaries` lists each file and import with its rule:

- `only via public.ts`: the import reaches a file inside another module.
  Import its `public.ts` instead, or move the shared code out of both modules.
- `not in dependsOn`: the import reaches another module's surface but the
  importing module does not list it. Add it to `dependsOn` if the dependency
  is real.

## `Property 'x' does not exist on type ModuleMongo`

The module neither owns collection `x` nor lists its owner in `dependsOn`.
Add the owner to `dependsOn` (and to the manifest's list) or stop using it.
If every collection is accepted instead, the `Register` augmentation is
missing: see the [guide](guide.md#the-registry).

## `Type '"x"' does not satisfy the constraint` on `ModuleMongo<'x'>`

With a `Register` augmentation, the name must be a registered module. Fix the
spelling, or add the module to the `as const` list.

## `ModuleHandle` rejects my handle

`ModuleHandle<Name, Handle>` needs `Handle` to have a readonly `db` object and
a `transaction` method. Add the missing member to the handle type; see the
[guide](guide.md#typing-collection-access).

## `Property 'databases' does not exist` (or `'clients'`)

`ModuleHandle` and `ModuleCoreHandle` omit `databases` and `clients` on purpose:
they are the host's way to reach other modules' collections. A module works
through `db` and `transaction` only. If the host needs them, use its own
unnarrowed handle outside the module.

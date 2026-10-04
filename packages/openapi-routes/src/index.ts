/**
 * @deprecated `@alxia/openapi-routes` moved to `@alxia/openapi`: install
 * it and change the import, nothing else. This last release re-exports it.
 *
 * @packageDocumentation
 */
import * as openapi from '@alxia/openapi';

/** @deprecated Moved to `@alxia/openapi`: `import { implemented } from '@alxia/openapi'`. */
export const implemented: typeof openapi.implemented = openapi.implemented;

/** @deprecated Moved to `@alxia/openapi`: `import { matchesSpec } from '@alxia/openapi'`. */
export const matchesSpec: typeof openapi.matchesSpec = openapi.matchesSpec;

/** @deprecated Renamed `matchesSpec`, in `@alxia/openapi`. */
export const exactly: typeof openapi.exactly = openapi.exactly;

/** @deprecated Moved to `@alxia/openapi`. */
export type Operations = openapi.Operations;

/** @deprecated Moved to `@alxia/openapi`. */
export type ImplementedOptions = openapi.ImplementedOptions;

/** @deprecated Moved to `@alxia/openapi`. */
export type MatchesSpecOptions = openapi.MatchesSpecOptions;

/** @deprecated Renamed `MatchesSpecOptions`, in `@alxia/openapi`. */
export type ExactlyOptions = openapi.ExactlyOptions;

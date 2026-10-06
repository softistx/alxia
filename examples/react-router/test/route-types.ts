// What `bun run typecheck` proves of withAlxia under React Router's
// generated types: `alxia` typed by app/server.ts's Register, a key nothing
// derives refused, and the page's loaderData still the loader's return.
import { type AlxiaArgs, alxiaOf, withAlxia } from "@alxia/react-router";
import type { Route } from "../app/routes/+types/home";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** The home page's loaderData, inferred through withAlxia. */
export const homeData: Equal<
  Route.ComponentProps["loaderData"],
  { name: string | null }
> = true;

export const typed = withAlxia(
  ({ alxia, params }: Route.LoaderArgs & AlxiaArgs) => {
    const name: string | undefined = alxia.user?.name;
    alxia.log.info("typed");
    // @ts-expect-error: nothing in app/server.ts derives `tenant`
    alxia.tenant;
    return { name, params };
  },
);

// React Router calls it with its own arguments alone.
export const called = (args: Route.LoaderArgs) => typed(args);

// A middleware under the generated types, its `next` passed on.
export const middleware: Route.MiddlewareFunction[] = [
  withAlxia(
    async (
      { alxia }: Parameters<Route.MiddlewareFunction>[0] & AlxiaArgs,
      next,
    ) => {
      alxia.log.info("middleware");
      return next();
    },
  ),
];

// alxiaOf(context) under the generated arguments, and context.alxia's limit:
// react-router/internal's RouterContextProvider is another declaration than
// the one @alxia/react-router augments. The day react-router unifies them,
// this directive goes unused and fails: then type context.alxia here.
export function plain({ context }: Route.LoaderArgs) {
  const name: string | undefined = alxiaOf(context).user?.name;
  // @ts-expect-error: TS2339 until react-router/internal shares the declaration
  context.alxia;
  return { name };
}

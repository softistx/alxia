import { Suspense } from "react";
import { Await } from "react-router";
import type { Route } from "./+types/slow";

export function loader() {
  // Not awaited: the page streams, its shell and fallback first.
  const later = new Promise<string>((resolve) =>
    setTimeout(() => resolve("Here after 400 ms"), 400),
  );
  return { now: "Here at once", later };
}

export default function Slow({ loaderData }: Route.ComponentProps) {
  return (
    <main className="p-4">
      <p>{loaderData.now}</p>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Await resolve={loaderData.later}>
          {(value) => <p id="later">{value}</p>}
        </Await>
      </Suspense>
    </main>
  );
}

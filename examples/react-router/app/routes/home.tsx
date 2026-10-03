import { alxiaOf } from "@alxia/react-router";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  // What app/server.ts built for this request, typed by its Register.
  const { user, log } = alxiaOf(context);
  log.info("home", { signedIn: user !== null });
  return { name: user?.name ?? null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <p className="pt-4 text-center">
        {loaderData.name === null ? (
          <Link to="/login">Sign in</Link>
        ) : (
          <>Signed in as {loaderData.name}</>
        )}{" "}
        · <Link to="/todos">Todos</Link> ·{" "}
        <Link to="/slow">A streamed page</Link>
      </p>
      <Welcome />
    </>
  );
}

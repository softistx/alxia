import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/login";
import { signIn } from "../session.server";

export async function action({ request }: Route.ActionArgs) {
  const name = String((await request.formData()).get("name") ?? "").trim();
  if (name === "") return data({ error: "Enter a name" }, { status: 400 });
  return redirect("/", { headers: { "set-cookie": signIn({ name }) } });
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <main className="p-4">
      <Form method="post">
        <input name="name" placeholder="Your name" className="border" />{" "}
        <button type="submit">Sign in</button>
      </Form>
      {actionData && <p role="alert">{actionData.error}</p>}
    </main>
  );
}

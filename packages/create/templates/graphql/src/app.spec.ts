import { describe, expect, test } from "bun:test";
import { app } from "./app";
import { db, pubsub } from "./store";

interface Result {
  data?: Record<string, unknown>;
  errors?: { message: string; extensions?: { code?: string } }[];
}

// POST /graphql in process, as a client would: no port.
async function query(
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
): Promise<Result> {
  const response = await app.request("/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.token && { authorization: `Bearer ${options.token}` }),
    },
    body: JSON.stringify({ query: source, variables: options.variables }),
  });
  return response.json();
}

const ADD =
  "mutation ($text: String!) { addNote(text: $text) { id text author { name } } }";

describe("queries", () => {
  test("answers { __typename }", async () => {
    expect(await query("{ __typename }")).toEqual({
      data: { __typename: "Query" },
    });
  });

  test("me is null with no token, and the user a token names", async () => {
    expect((await query("{ me { name } }")).data).toEqual({ me: null });
    expect((await query("{ me { name } }", { token: "wrong" })).data).toEqual({
      me: null,
    });
    expect(
      (await query("{ me { name } }", { token: "ada-token" })).data,
    ).toEqual({
      me: { name: "Ada" },
    });
  });
});

describe("mutations", () => {
  test("addNote refuses a request with no token", async () => {
    const { errors } = await query(ADD, { variables: { text: "Hello" } });
    expect(errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  test("addNote stores the note for the viewer, and notes lists it", async () => {
    const added = await query(ADD, {
      token: "ada-token",
      variables: { text: "Hello" },
    });
    expect(added.errors).toBeUndefined();
    expect(added.data).toEqual({
      addNote: {
        id: expect.any(String),
        text: "Hello",
        author: { name: "Ada" },
      },
    });
    const listed = await query("{ notes { text author { id } } }");
    expect(listed.data?.["notes"]).toContainEqual({
      text: "Hello",
      author: { id: "1" },
    });
    expect(db.notes.length).toBeGreaterThan(0);
  });

  test("a query the schema does not have is refused", async () => {
    expect((await query("{ nothing }")).errors?.[0]?.message).toContain(
      "nothing",
    );
  });
});

describe("subscriptions", () => {
  test("noteAdded streams each note over server-sent events", async () => {
    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({ query: "subscription { noteAdded { text } }" }),
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error("no body");
    // Publish until the stream carries it: the subscription starts as it is read.
    const publish = setInterval(
      () =>
        pubsub.publish("noteAdded", {
          id: "9",
          text: "Streamed",
          authorId: "1",
        }),
      20,
    );
    try {
      let seen = "";
      while (!seen.includes("Streamed")) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`the stream ended: ${seen}`);
        seen += new TextDecoder().decode(value);
      }
      expect(seen).toContain('"noteAdded":{"text":"Streamed"}');
    } finally {
      clearInterval(publish);
      await reader.cancel();
    }
  });
});

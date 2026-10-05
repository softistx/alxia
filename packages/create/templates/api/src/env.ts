import { defineEnv } from "@alxia/env";
import { z } from "zod";

// `bun dev` and `bun test` run in development and test; anything else,
// production included, is a deployment.
const local = ["development", "test"].includes(Bun.env.NODE_ENV ?? "");

// Checked once, when this module is first imported: a missing or malformed
// variable stops the process, with every issue, before it listens. Secrets
// print as `***`. API_KEY defaults to `dev-key` in development and test
// alone: deployed, it is required. API_DOCS serves the API reference at
// /docs: on in development, off unless set elsewhere.
export const env = defineEnv(
  {
    PORT: z.coerce.number().default(3000),
    API_KEY: local ? z.string().min(1).default("dev-key") : z.string().min(1),
    API_DOCS: z.stringbool().default(Bun.env.NODE_ENV === "development"),
  },
  { secret: ["API_KEY"] },
);

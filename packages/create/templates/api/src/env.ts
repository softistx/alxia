import { trustProxy } from "@alxia/core";
import { defineEnv } from "@alxia/env";
import { z } from "zod";

// `bun dev` and `bun test` run in development and test; anything else,
// production included, is a deployment.
const local = ["development", "test"].includes(Bun.env.NODE_ENV ?? "");

// A range or an address trustProxy accepts: it throws on any other.
const isRange = (range: string) => {
  try {
    trustProxy({ trusted: [range], untrusted: "refuse" });
    return true;
  } catch {
    return false;
  }
};

// Checked once, when this module is first imported: a missing or malformed
// variable stops the process, with every issue, before it listens. Secrets
// print as `***`. API_KEY defaults to `dev-key` in development and test
// alone: deployed, it is required. API_DOCS serves the API reference at
// /docs: on in development, off unless set elsewhere. TRUSTED_PROXIES is
// unset by default: the app then reads no forwarding header. Set it behind a
// load balancer (src/context.ts).
export const env = defineEnv(
  {
    PORT: z.coerce.number().default(3000),
    API_KEY: local ? z.string().min(1).default("dev-key") : z.string().min(1),
    API_DOCS: z.stringbool().default(Bun.env.NODE_ENV === "development"),
    TRUSTED_PROXIES: z
      .string()
      .transform((list) =>
        list
          .split(",")
          .map((range) => range.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().refine(isRange, "not a CIDR range or address")))
      .transform((ranges) => (ranges.length > 0 ? ranges : undefined))
      .optional(),
  },
  { secret: ["API_KEY"] },
);

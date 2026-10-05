import { trustProxy } from "@alxia/core";
import { defineEnv } from "@alxia/env";
import { z } from "zod";

// A range or an address trustProxy accepts: it throws on any other.
const isRange = (range: string) => {
  try {
    trustProxy({ trusted: [range], untrusted: "refuse" });
    return true;
  } catch {
    return false;
  }
};

// Checked once, when this module is first imported: a malformed variable
// stops the process, with every issue, before it listens. TRUSTED_PROXIES is
// unset by default: the app then reads no forwarding header. Set it behind a
// load balancer (src/context.ts).
export const env = defineEnv({
  PORT: z.coerce.number().default(3000),
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
});

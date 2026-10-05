import { defineEnv } from "@alxia/env";
import { z } from "zod";

// Checked once, when this module is first imported: a missing or malformed
// variable stops the process, with every issue, before it listens. Secrets
// print as `***`. The API_KEY default is for development: set it outside.
export const env = defineEnv(
  {
    PORT: z.coerce.number().default(3000),
    API_KEY: z.string().min(1).default("dev-key"),
  },
  { secret: ["API_KEY"] },
);

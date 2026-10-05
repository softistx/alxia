import { defineEnv } from "@alxia/env";
import { z } from "zod";

// Checked once, when this module is first imported: a malformed variable
// stops the process, with every issue, before it listens.
export const env = defineEnv({
  PORT: z.coerce.number().default(3000),
});

import { defineConfig } from "@nxgt/openapi-codegen";

// `bun run generate` writes src/generated/ from openapi.yaml; `alxia` adds
// alxia.ts, the operations src/routes/todos.ts binds. The 400 is alxia's own,
// declared in openapi.yaml, not the one validationErrors would add.
export default defineConfig({
  input: "openapi.yaml",
  output: "src/generated",
  alxia: true,
  validationErrors: false,
});

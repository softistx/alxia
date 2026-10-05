import type { CodegenConfig } from "@graphql-codegen/cli";

// `bun run generate` writes src/generated/resolvers.ts from schema.graphql:
// the schema's types and `Resolvers`, whose context is the app's own
// (`Context`, src/context.ts) and whose `Note` is the record the store holds
// (`NoteRecord`), so a resolver returns the record and `Note.author` reads it.
const config: CodegenConfig = {
  schema: "schema.graphql",
  generates: {
    "src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        contextType: "../context#Context",
        mappers: { Note: "../store#NoteRecord" },
        useTypeImports: true,
        useIndexSignature: true,
      },
    },
  },
};

export default config;

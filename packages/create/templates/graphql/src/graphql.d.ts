// `import typeDefs from "../schema.graphql" with { type: "text" }`: Bun
// reads the file as text, and `bun run build` puts it in dist/server.js.
declare module "*.graphql" {
  const source: string;
  export default source;
}

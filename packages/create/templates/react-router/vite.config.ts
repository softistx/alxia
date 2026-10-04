import { alxia } from "@alxia/react-router/vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), alxia()],
  resolve: {
    tsconfigPaths: true,
  },
});

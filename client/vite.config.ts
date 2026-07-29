import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rawBasePath = process.env.BASE_PATH ?? "/";
const normalizedBasePath = rawBasePath === "/" ? "/" : `/${rawBasePath.replace(/^\/+|\/+$/g, "")}/`;

export default defineConfig({
  base: normalizedBasePath,
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [".."]
    }
  }
});

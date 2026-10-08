import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // demo-output lives in the repo root, one level above the app.
  server: { fs: { allow: [".."] } },
});

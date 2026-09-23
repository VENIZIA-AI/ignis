import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server forwards /api to rpc-api-server, so the browser sees one origin and the API
// needs no CORS.
const API_SERVER = "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": API_SERVER } },
  preview: { proxy: { "/api": API_SERVER } },
});

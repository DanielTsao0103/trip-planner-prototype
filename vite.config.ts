import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  // Stop a misplaced private key before Vite can include it in a public build.
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("VITE_") && value && (/SECRET|ACCESS_TOKEN|SERVICE_ROLE/.test(name) || /^(sb_secret_|sbp_)/.test(value))) {
      throw new Error("A private credential is configured with a VITE_ prefix. Move it to the server or management env file.");
    }
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key && !key.startsWith("sb_publishable_")) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY must be an sb_publishable_ key.");
  }
  return {
    base: "./",
    // Ivy's Maps key allows this exact local origin. Do not silently move to an
    // unapproved port when another preview is already running.
    server: { host: "127.0.0.1", port: 5190, strictPort: true },
    preview: { host: "127.0.0.1", port: 5190, strictPort: true },
    build: {
      outDir: "dist",
      rollupOptions: { input: { main: "index.html", popularTimes: "popular-times.html" } },
    },
  };
});

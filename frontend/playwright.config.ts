import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // The e2e build talks to fake hosts that the test intercepts in the browser (see e2e/fakeBackend.ts).
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: "http://api.paysasa.test",
      VITE_SUPABASE_URL: "http://supabase.paysasa.test",
      VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
      VITE_PAYPAL_MODE: "mock",
      VITE_ENABLE_DEMO: "true",
    },
  },
});

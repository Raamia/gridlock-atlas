import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3217);

export default defineConfig({
  testDir: "tests/ui",
  timeout: 90_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--use-angle=metal", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

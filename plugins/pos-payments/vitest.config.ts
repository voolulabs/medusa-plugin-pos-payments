import { defineConfig } from "vitest/config"

// Specs vivem só em src/**/__tests__ — o output do build (.medusa/server) e
// dist nunca entram na suíte (rodavam duas vezes e o .js compilado falhava).
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/.medusa/**", "**/dist/**"],
  },
})

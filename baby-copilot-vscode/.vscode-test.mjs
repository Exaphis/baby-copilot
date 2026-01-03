import { defineConfig } from "@vscode/test-cli";
import path from "path";
import { fileURLToPath } from "url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  files: "out/test/**/*.test.js",
  extensionDevelopmentPath: ".",
  workspaceFolder: path.join(currentDir, "test-fixtures/basic"),
  launchArgs: ["--enable-proposed-api", "baby-copilot.baby-copilot"],
});

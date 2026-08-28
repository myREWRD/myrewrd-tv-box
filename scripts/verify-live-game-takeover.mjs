import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const failures = [];

function expect(expression, description) {
  if (!expression.test(main)) failures.push(description);
}

expect(/case "live-game":/, "TV Box must define a dedicated live-game display mode.");
expect(/\/api\/tv-game\?token=\$\{encodeURIComponent\(config\.tvToken\)\}/, "TV Box must check the token-scoped Live Games feed.");
expect(/liveGameActive && currentMode !== "live-game"/, "Active games must take priority over every configured display mode.");
expect(/!liveGameActive && currentMode === "live-game"/, "TV Box must return to the configured mode when the game ends.");
expect(/!liveGameActive && data\.mode && data\.mode !== currentMode/, "Configured mode changes must not override an active game.");
expect(/if \(compareVersions\(APP_VERSION, latestVersion\) >= 0\) return;/, "TV Box updater must accept a newer release and reject equal or older versions.");
if (/if \(compareVersions\(APP_VERSION, latestVersion\) <= 0\) return;/.test(main)) failures.push("TV Box updater must not retain the reversed version gate.");

if (packageJson.version !== "1.0.1") failures.push("TV Box incident fix must increment the updater version to 1.0.1.");

if (failures.length) {
  console.error("TV Box Live Games takeover regression check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("TV Box Live Games takeover regression check passed.");

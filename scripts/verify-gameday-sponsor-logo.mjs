import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const overlay = fs.readFileSync(path.join(root, "src/pages/gameday-sponsor.html"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const require = createRequire(import.meta.url);
const { normalizeSponsorPayload, sponsorLogoCandidates } = require(path.join(root, "src/sponsor.js"));

assert.match(main, /require\("\.\/sponsor"\)/);
assert.match(main, /sponsorData = normalizeSponsorPayload\(data\.sponsor\)/);

const normalized = normalizeSponsorPayload({
  name: "Red Bull",
  logo_url: "https://example.com/standard.png",
  logo_url_medium: "https://example.com/medium.png",
  logo_url_compact: "https://example.com/compact.png",
});
assert.equal(normalized.logoUrl, "https://example.com/standard.png");
assert.equal(normalized.logoUrlMedium, "https://example.com/medium.png");
assert.equal(normalized.logoUrlCompact, "https://example.com/compact.png");
assert.deepEqual(sponsorLogoCandidates(normalized), [
  "https://example.com/compact.png",
  "https://example.com/medium.png",
  "https://example.com/standard.png",
]);
assert.deepEqual(sponsorLogoCandidates({
  logoUrlCompact: "https://example.com/logo.png",
  logoUrlMedium: "https://example.com/logo.png",
  logoUrl: null,
}), ["https://example.com/logo.png"]);

assert.match(overlay, /function applySponsor\(sponsor\)/);
assert.match(overlay, /let sponsorRenderVersion = 0/);
assert.match(overlay, /function loadSponsorLogo\(logo, logoUrls, renderVersion, index = 0\)/);
assert.match(overlay, /\[sponsor\.logoUrlCompact, sponsor\.logoUrlMedium, sponsor\.logoUrl\]/);
assert.match(overlay, /const renderVersion = \+\+sponsorRenderVersion/);
assert.match(overlay, /const probe = new Image\(\)/);
assert.match(overlay, /renderVersion !== sponsorRenderVersion/);
assert.match(overlay, /loadSponsorLogo\(logo, logoUrls, renderVersion, index \+ 1\)/);
assert.match(overlay, /logo\.src = logoUrls\[index\]/);
assert.doesNotMatch(overlay, /logo\.src\s*=\s*sponsor\.logoUrlMedium \|\| sponsor\.logoUrl/);
const [major, minor, patch] = packageJson.version.split('.').map(Number);
assert.ok(major > 1 || (major === 1 && (minor > 0 || (minor === 0 && patch >= 3))), "Sponsor-logo fix must retain version 1.0.3 or newer");

console.log("Game Day sponsor logo normalization contract passed.");

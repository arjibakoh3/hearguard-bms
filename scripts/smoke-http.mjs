import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
const request = (path) => fetch(new URL(path, base), {
  redirect: "manual",
  signal: AbortSignal.timeout(5000),
});

let login;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const response = await request("/login");
    if (response.status === 200) {
      login = response;
      break;
    }
  } catch {
    // The server may still be starting.
  }
  await setTimeout(500);
}
assert.ok(login, "Login page did not become ready");
const html = await login.text();
assert.match(html, /HearGuard/i, "Login page is not the HearGuard application");

const assetPath = html.match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+)"/)?.[1];
assert.ok(assetPath, "Login page has no Next.js static asset");
const assetUrl = new URL(assetPath, base);
assert.equal(assetUrl.origin, base.origin, "Static asset must use the application origin");
assert.equal((await request(assetUrl.pathname + assetUrl.search)).status, 200, "Static asset is unavailable");
assert.equal((await request("/file.svg")).status, 200, "Public UI asset is unavailable");

const protectedPage = await request("/workspace");
assert.ok([302, 303, 307, 308].includes(protectedPage.status), "Anonymous workspace request must redirect");
assert.equal(new URL(protectedPage.headers.get("location"), base).pathname, "/login", "Anonymous workspace request must reach login");
console.log("HTTP smoke check passed: login, static asset, public asset and protected-route redirect");

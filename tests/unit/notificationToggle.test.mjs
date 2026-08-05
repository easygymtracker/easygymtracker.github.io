import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression cover for the floating bell bug:
//  - turning it off must close the notification already on screen
//    (it is shown with requireInteraction, so it never closes by itself)
//  - the icon must stay legible in both states, which means real stroke icons
//    rather than emoji that CSS cannot recolour.

const indexHtml = readFileSync("index.html", "utf8");
const baseCss = readFileSync("styles/base.css", "utf8");
const appJs = readFileSync("src/app.js", "utf8");
const swJs = readFileSync("sw.js", "utf8");

test("clearSessionNotification asks the service worker to close the notification", async () => {
    const posted = [];
    Object.defineProperty(globalThis, "navigator", {
        value: { serviceWorker: { controller: { postMessage: (m) => posted.push(m) } } },
        configurable: true,
        writable: true,
    });

    const { clearSessionNotification } = await import("../../src/services/sessionNotifications.js");
    clearSessionNotification();

    assert.deepEqual(posted, [{ type: "SESSION_END" }]);
});

test("the service worker actually closes notifications on that message", () => {
    // Guards the contract between the two files: renaming one side must fail here.
    assert.match(swJs, /case "SESSION_END"/);
    const handler = swJs.slice(swJs.indexOf('case "SESSION_END"'));
    assert.match(handler.slice(0, 400), /getNotifications[\s\S]*close\(\)/);
});

test("switching the bell off closes the live notification", () => {
    // The toggle used to only flip the preference, leaving a pinned notification
    // on screen — which read as 'disabling notifications does nothing'.
    assert.match(appJs, /if \(!next\) clearSessionNotification\(\);/);
});

test("the bell uses stroke icons, not emoji", () => {
    const button = indexHtml.slice(
        indexHtml.indexOf('id="btnNotifToggle"'),
        indexHtml.indexOf("</button>", indexHtml.indexOf('id="btnNotifToggle"')),
    );

    assert.match(button, /notifToggleIconOn/);
    assert.match(button, /notifToggleIconOff/);
    assert.match(button, /stroke="currentColor"/);
    // The old emoji swap left the "off" glyph invisible on the dark background.
    assert.doesNotMatch(button, /\u{1F514}|\u{1F515}/u);
    assert.doesNotMatch(appJs, /\u{1F514}|\u{1F515}/u);
});

test("exactly one bell icon is shown per state", () => {
    assert.match(baseCss, /\.notifToggle \.notifToggleIconOff,\s*\.notifToggle\[data-enabled="false"\] \.notifToggleIconOn \{\s*display: none;/);
    assert.match(baseCss, /\.notifToggle\[data-enabled="false"\] \.notifToggleIconOff \{\s*display: block;/);
});

test("asset version is bumped past the one that shipped the old styles", () => {
    // base.css is cache-busted by ?v=; forgetting to bump it means returning
    // users keep the stale stylesheet and never receive CSS fixes.
    assert.doesNotMatch(indexHtml, /\?v=20260505e/);
    assert.doesNotMatch(appJs, /20260505e/);

    const htmlVersions = [...indexHtml.matchAll(/base\.css\?v=([\w.-]+)/g)].map((m) => m[1]);
    const jsVersion = appJs.match(/const STYLE_VERSION = "([\w.-]+)"/)?.[1];
    assert.ok(htmlVersions.length > 0, "expected a versioned base.css link");
    assert.equal(htmlVersions[0], jsVersion, "index.html and STYLE_VERSION must agree");
});

test("page content can scroll clear of the floating buttons", () => {
    // 44px button + 18px offset, so the app needs more than the old 40px.
    const padding = baseCss.match(/\.app \{[\s\S]*?padding: 18px 14px calc\((\d+)px/)?.[1];
    assert.ok(Number(padding) >= 62, `bottom padding ${padding}px does not clear the toggles`);
});

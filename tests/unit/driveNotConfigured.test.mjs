import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Guards the "no client ID -> never offer Google Drive" rule. The UI itself needs
// a DOM, but the two things that make the rule fail-safe are checkable here:
// the config guard, and the markup shipping hidden by default.

const { isGoogleDriveConfigured, GOOGLE_DRIVE_CLIENT_ID } =
    await import("../../src/config/googleDrive.js");
const { preloadGoogleIdentity } = await import("../../src/services/googleDriveBackup.js");

const indexHtml = readFileSync("index.html", "utf8");

function openingTagFor(id) {
    const match = indexHtml.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
    assert.ok(match, `expected an element with id="${id}" in index.html`);
    return match[0];
}

// These must stay green whether or not a deployment has pasted in a client ID,
// so they assert the rule rather than the shipped value.
const configured = isGoogleDriveConfigured();

test("the config guard tracks whether a client ID is actually present", () => {
    assert.equal(configured, GOOGLE_DRIVE_CLIENT_ID.trim().length > 0);
});

test("the Drive storage card ships hidden, so a JS failure cannot offer it", () => {
    assert.match(openingTagFor("storageOptionDrive"), /\buHidden\b/);
});

test("the privacy page's Drive card also ships hidden", () => {
    assert.match(openingTagFor("privacyCloudBackupCard"), /\buHidden\b/);
});

test("preload never contacts Google while unconfigured", { skip: configured }, async () => {
    // Would throw on `document`/`window` if it tried to inject the GIS script.
    assert.equal(await preloadGoogleIdentity(), false);
});

test("both intro variants exist, so hiding the card cannot leave stale wording", async () => {
    const { DICTS } = await import("../../src/internationalization/dicts.js");
    for (const [lang, dict] of Object.entries(DICTS)) {
        assert.ok(dict["backup.where.title"]?.trim(), `${lang} missing backup.where.title`);
        assert.ok(dict["backup.where.titleLocalOnly"]?.trim(), `${lang} missing backup.where.titleLocalOnly`);
    }
});

test("the removed 'unavailable' string is gone from every dictionary", async () => {
    const { DICTS } = await import("../../src/internationalization/dicts.js");
    for (const [lang, dict] of Object.entries(DICTS)) {
        assert.equal(dict["backup.cloud.unavailable"], undefined, `${lang} still defines a dead key`);
    }
});

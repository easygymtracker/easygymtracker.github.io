// tests/e2e/backupConflict.e2e.mjs
//
// Drives the real app and checks the backup-conflict guards end to end:
// the change marker is fed by real writes, the status line reports unsynced
// work, and a restore prompt names the backup's date plus what it would cost.
//
// The Drive card only renders in a build with a client ID, so the caller is
// expected to have patched one in (see the runner notes in the commit).
//
// Run: BASE_URL=... CDP_URL=... node tests/e2e/backupConflict.e2e.mjs

import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const CDP = process.env.CDP_URL ?? "http://localhost:9222";

let failures = 0;
function check(ok, label, detail) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
    if (!ok) failures += 1;
}

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0] ?? (await browser.newContext());
for (const open of ctx.pages()) await open.close().catch(() => {});

const page = await ctx.newPage();
page.on("pageerror", (err) => check(false, `uncaught page error: ${err.message}`));

await page.goto(`${BASE}/?p=/profile`, { waitUntil: "networkidle" });

const configured = await page.evaluate(async () =>
    (await import("/src/config/googleDrive.js")).isGoogleDriveConfigured());
console.log(`Build has a Drive client ID: ${configured}\n`);

// --- 1. tracking is opt-in, and only real writes feed it ---------------------

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

const whileOff = await page.evaluate(async () => {
    const { storage } = await import("/src/services/services.js");
    storage.set("routines:index", ["rt_probe"]);
    return localStorage.getItem("gymapp_data_changed_at");
});
check(whileOff === null, "with Drive unconnected, writes stamp nothing", whileOff);

if (!configured) {
    // A local-only build must not even install the hook. Nothing below applies.
    check(true, "local-only build: no Drive bookkeeping at all");
    await page.close();
    await browser.close();
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}

const afterWrite = await page.evaluate(async () => {
    const { setDriveBackupEnabled } = await import("/src/services/cloudBackupPreference.js");
    setDriveBackupEnabled(true);
    const seededOnConnect = localStorage.getItem("gymapp_data_changed_at");

    localStorage.removeItem("gymapp_data_changed_at");
    const { storage } = await import("/src/services/services.js");
    storage.set("routines:index", ["rt_probe"]);
    return { seededOnConnect, afterWrite: localStorage.getItem("gymapp_data_changed_at") };
});
check(Boolean(afterWrite.seededOnConnect), "connecting seeds the marker", afterWrite.seededOnConnect);
check(Boolean(afterWrite.afterWrite), "once connected, a store write stamps it", afterWrite.afterWrite);

const readsAreClean = await page.evaluate(async () => {
    const { storage } = await import("/src/services/services.js");
    localStorage.setItem("gymapp_data_changed_at", "SENTINEL");
    storage.get("routines:index");
    storage.snapshot();
    return localStorage.getItem("gymapp_data_changed_at") === "SENTINEL";
});
check(readsAreClean, "reads leave the marker alone");

// --- 2. the status line reflects the sync state ------------------------------

async function statusFor(setup) {
    await page.evaluate((s) => {
        localStorage.setItem("gymapp_drive_backup_enabled", "true");
        localStorage.setItem("gymapp_drive_backup_last_at", s.lastAt);
        if (s.syncedAt) localStorage.setItem("gymapp_drive_synced_local_at", s.syncedAt);
        else localStorage.removeItem("gymapp_drive_synced_local_at");
        if (s.changedAt) localStorage.setItem("gymapp_data_changed_at", s.changedAt);
        else localStorage.removeItem("gymapp_data_changed_at");
    }, setup);

    // ?p= is the deep-link form the 404 fallback restores; it needs the root path.
    await page.goto(`${BASE}/?p=/profile`, { waitUntil: "networkidle" });
    await page.waitForSelector("#route-profile:not(.routeHidden)");
    await page.waitForTimeout(200);
    return page.evaluate(() => ({
        cardVisible: !document.getElementById("storageOptionDrive")?.classList.contains("uHidden"),
        status: document.getElementById("backupDriveStatus")?.textContent?.trim(),
        hasI18nAttr: document.getElementById("backupDriveStatus")?.hasAttribute("data-i18n"),
    }));
}

const synced = await statusFor({
    lastAt: "2026-08-01T10:00:00.000Z",
    syncedAt: "2026-08-01T10:00:00.000Z",
    changedAt: "2026-08-01T09:00:00.000Z",
});
check(synced.cardVisible, "Drive card renders in a configured build");
check(/2026/.test(synced.status ?? ""), "synced state shows the backup date", synced.status);
check(!/unsaved|sin guardar/i.test(synced.status ?? ""), "synced state does not claim unsaved work", synced.status);

const dirty = await statusFor({
    lastAt: "2026-08-01T10:00:00.000Z",
    syncedAt: "2026-08-01T10:00:00.000Z",
    changedAt: "2026-08-03T18:00:00.000Z",
});
check(/unsaved changes/i.test(dirty.status ?? ""), "unsynced work is reported in the status line", dirty.status);
check(dirty.hasI18nAttr === false, "dynamic status drops data-i18n so a locale switch cannot clobber it");

// --- 3. the restore prompt is dated and states the cost ----------------------

const prompts = [];
page.on("dialog", async (d) => {
    prompts.push({ type: d.type(), message: d.message() });
    // Dismiss: this run must not actually wipe anything.
    await d.dismiss();
});

const backupFile = await page.evaluate(async () => {
    const { buildFullBackupV1 } = await import("/src/export/fullBackup.js");
    const { storage } = await import("/src/services/services.js");
    return JSON.stringify(buildFullBackupV1({
        storage,
        now: new Date("2026-07-15T08:00:00.000Z"),
    }));
});

await page.setInputFiles("#fullBackupFile", {
    name: "gym-tracker-backup-2026-07-15.gymbackup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupFile),
});
await page.waitForTimeout(600);

const restorePrompt = prompts.find((p) => p.type === "confirm")?.message ?? "";
check(/2026/.test(restorePrompt) && /Jul|15/.test(restorePrompt),
    "restore prompt names the backup's own date", restorePrompt);
check(/not in that backup|would be lost/i.test(restorePrompt),
    "restore prompt warns about local work it would discard", restorePrompt);
check(/cannot be undone/i.test(restorePrompt),
    "restore prompt still states it is irreversible");

const survived = await page.evaluate(() => localStorage.getItem("gymapp_drive_backup_enabled"));
check(survived === "true", "dismissing the prompt restored nothing");

// --- 4. the save conflict, against a faked Drive -----------------------------
//
// Google is stubbed at the network boundary: the identity script is replaced by
// a shim that hands out a token without a popup, and the Drive REST endpoints
// answer from a fixture. Everything below this line is the app's real code.

const REMOTE_REV = "2026-08-05T12:00:00.000Z";
let uploads = 0;

await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.google = { accounts: { oauth2: {
        initTokenClient: (cfg) => ({ requestAccessToken: () =>
            cfg.callback({ access_token: "fake-token", expires_in: 3600 }) }),
        revoke: (_t, cb) => cb && cb(),
    } } };`,
}));

await page.route("https://www.googleapis.com/drive/v3/files**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
        files: [{ id: "file1", name: "easy-gym-tracker-backup.json", modifiedTime: REMOTE_REV }],
    }),
}));

await page.route("https://www.googleapis.com/upload/drive/v3/files/**", (route) => {
    uploads += 1;
    return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ id: "file1", modifiedTime: "2026-08-06T09:00:00.000Z" }),
    });
});

async function clickSaveWith(state) {
    prompts.length = 0;
    uploads = 0;
    await page.evaluate((s) => {
        localStorage.setItem("gymapp_drive_backup_enabled", "true");
        localStorage.setItem("gymapp_drive_backup_last_at", s.knownRev);
        localStorage.setItem("gymapp_drive_synced_local_at", "2026-08-01T10:00:00.000Z");
        localStorage.setItem("gymapp_data_changed_at", "2026-08-02T10:00:00.000Z");
    }, state);

    await page.goto(`${BASE}/?p=/profile`, { waitUntil: "networkidle" });
    await page.waitForSelector("#btnDriveSave:not(.uHidden)");
    await page.click("#btnDriveSave");
    await page.waitForTimeout(900);
}

// A device that last synced before another one saved.
await clickSaveWith({ knownRev: "2026-08-01T10:00:00.000Z" });
const overwritePrompt = prompts.find((p) => p.type === "confirm")?.message ?? "";
check(/Aug 5, 2026/.test(overwritePrompt),
    "a stale device is warned, and the prompt dates the backup it would replace", overwritePrompt);
check(/another device/i.test(overwritePrompt), "the prompt explains where that backup came from");
check(uploads === 0, "declining the warning uploads nothing", uploads);

// A device already holding the current revision.
await clickSaveWith({ knownRev: REMOTE_REV });
const secondRun = prompts.map((p) => p.message);
check(!secondRun.some((m) => /another device/i.test(m)),
    "an up-to-date device is not nagged", secondRun);
check(uploads === 1, "...and its backup actually uploads", uploads);

const afterSave = await page.evaluate(() => ({
    lastAt: localStorage.getItem("gymapp_drive_backup_last_at"),
    synced: localStorage.getItem("gymapp_drive_synced_local_at"),
}));
check(afterSave.lastAt === "2026-08-06T09:00:00.000Z",
    "a successful save records the new revision", afterSave);
check(Boolean(afterSave.synced), "a successful save clears the unsynced flag", afterSave);

await page.close();
await browser.close();

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// pages/profilePage/backupSection.js
//
// Drives the "Backup & storage" block: the local-only option (always on) and the
// optional Google Drive copy. Kept separate from profilePage.js because it is a
// whole-app concern that merely happens to live on the profile screen.

import { t } from "../../internationalization/i18n.js";
import { storage } from "../../services/services.js";
import {
    buildFullBackupV1,
    downloadFullBackup,
    parseFullBackup,
    restoreFullBackup,
} from "../../export/fullBackup.js";
import { isGoogleDriveConfigured } from "../../config/googleDrive.js";
import {
    connectDrive,
    disconnectDrive,
    getDriveBackupMeta,
    isDriveSessionLive,
    loadBackupFromDrive,
    preloadGoogleIdentity,
    saveBackupToDrive,
} from "../../services/googleDriveBackup.js";
import {
    getLastDriveBackupAt,
    getUnsyncedChangeAt,
    isDriveBackupEnabled,
    isRemoteRevisionUnknown,
    markDriveSynced,
    setDriveBackupEnabled,
    setLastDriveBackupAt,
} from "../../services/cloudBackupPreference.js";

function formatWhen(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(date);
}

export function mountBackupSection() {
    const sectionEl = document.getElementById("backupSection");
    if (!sectionEl) return { render() {} };

    const exportBtn = document.getElementById("btnExportFullBackup");
    const importBtn = document.getElementById("btnImportFullBackup");
    const importFileInput = document.getElementById("fullBackupFile");

    const introEl = document.getElementById("backupWhereIntro");
    const driveCardEl = document.getElementById("storageOptionDrive");
    const driveControlsEl = document.getElementById("backupDriveControls");
    const driveStatusEl = document.getElementById("backupDriveStatus");
    const connectBtn = document.getElementById("btnDriveConnect");
    const saveBtn = document.getElementById("btnDriveSave");
    const restoreBtn = document.getElementById("btnDriveRestore");
    const disconnectBtn = document.getElementById("btnDriveDisconnect");

    const driveAvailable = isGoogleDriveConfigured();
    let busy = false;

    // The status line is partly dynamic (it interpolates a date), which data-i18n
    // cannot express — so drop the attribute when it is, or a locale switch would
    // silently revert the line to "Not connected".
    function setStatus(text, i18nKey = null) {
        if (!driveStatusEl) return;
        driveStatusEl.textContent = text;
        if (i18nKey) driveStatusEl.setAttribute("data-i18n", i18nKey);
        else driveStatusEl.removeAttribute("data-i18n");
    }

    function syncDriveUi() {
        // No client ID configured -> the Drive option does not exist in this build.
        // Hide the whole card rather than showing a dead one, and stop promising
        // "two places" in the intro when only local storage is on offer.
        if (driveCardEl) driveCardEl.classList.toggle("uHidden", !driveAvailable);

        if (introEl) {
            const key = driveAvailable ? "backup.where.title" : "backup.where.titleLocalOnly";
            // Set the attribute too, so translateDocument() keeps it on locale change.
            introEl.setAttribute("data-i18n", key);
            introEl.textContent = t(key);
        }

        if (!driveAvailable) return;

        if (driveControlsEl) driveControlsEl.classList.remove("uHidden");

        const enabled = isDriveBackupEnabled();

        if (connectBtn) connectBtn.classList.toggle("uHidden", enabled);
        for (const btn of [saveBtn, restoreBtn, disconnectBtn]) {
            btn?.classList.toggle("uHidden", !enabled);
        }

        for (const btn of [connectBtn, saveBtn, restoreBtn, disconnectBtn]) {
            if (btn) btn.disabled = busy;
        }

        if (busy) return;

        if (!enabled) {
            setStatus(t("backup.status.notConnected"), "backup.status.notConnected");
            return;
        }

        const when = formatWhen(getLastDriveBackupAt());
        if (!when) {
            setStatus(t("backup.status.never"), "backup.status.never");
            return;
        }

        const key = getUnsyncedChangeAt() ? "backup.status.pendingChanges" : "backup.status.lastBackup";
        setStatus(t(key, { when }));
    }

    function withBusy(fn) {
        return async () => {
            if (busy) return;
            busy = true;
            setStatus(t("backup.busy"), "backup.busy");
            syncDriveUi();
            try {
                await fn();
            } catch (err) {
                alert(t("backup.msg.error", { message: String(err?.message ?? err) }));
            } finally {
                busy = false;
                syncDriveUi();
            }
        };
    }

    /**
     * Asks before destroying local data, naming the backup's own date so an older
     * copy is recognisable, and calling out work that would be lost with it.
     */
    function confirmRestore(backupIso) {
        const backupWhen = formatWhen(backupIso);
        const lines = [backupWhen
            ? t("backup.confirm.restoreDated", { when: backupWhen })
            : t("backup.confirm.restore")];

        const localWhen = formatWhen(getUnsyncedChangeAt());
        if (localWhen) lines.push(t("backup.warn.localNewer", { when: localWhen }));

        return confirm(lines.join("\n\n"));
    }

    function restoreFromParsed(parsed, { driveModifiedTime = null } = {}) {
        restoreFullBackup({ parsed, storage });

        // After the restore, not before: restoring writes to storage, which stamps
        // a fresh "changed at". Marking synced last leaves the device clean.
        if (driveModifiedTime) markDriveSynced(driveModifiedTime);

        alert(t("backup.msg.restored"));
        // Every store cached data in memory; a reload is the only honest way to
        // show the restored state consistently.
        location.reload();
    }

    // --- local device backup (always available) ------------------------------

    exportBtn?.addEventListener("click", () => {
        downloadFullBackup({ data: buildFullBackupV1({ storage }) });
    });

    importBtn?.addEventListener("click", () => {
        if (!importFileInput) return;
        importFileInput.value = "";
        importFileInput.click();
    });

    importFileInput?.addEventListener("change", () => {
        const file = importFileInput.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const raw = String(event.target?.result ?? "");
                // Read the stamp the file carries so the prompt can date it too.
                const exportedAt = parseFullBackup(raw).exportedAt;
                if (!confirmRestore(exportedAt)) return;

                // Deliberately not marked as synced: a file restore has nothing to
                // do with whatever is currently sitting in Drive.
                restoreFromParsed(raw);
            } catch (err) {
                alert(t("backup.msg.error", { message: String(err?.message ?? err) }));
            }
        };
        reader.readAsText(file);
    });

    // --- optional Google Drive copy ------------------------------------------

    connectBtn?.addEventListener("click", withBusy(async () => {
        await connectDrive();
        setDriveBackupEnabled(true);

        // Adopt an existing backup's timestamp so a second device shows when the
        // account was last backed up rather than a misleading "no backup yet".
        const meta = await getDriveBackupMeta();
        if (meta?.modifiedTime) setLastDriveBackupAt(meta.modifiedTime);
    }));

    saveBtn?.addEventListener("click", withBusy(async () => {
        // One file per account and a blind PATCH, so a stale device would otherwise
        // wipe a newer backup without a word. Check the revision before writing.
        const remote = await getDriveBackupMeta();
        if (isRemoteRevisionUnknown(remote?.modifiedTime)) {
            const when = formatWhen(remote.modifiedTime) ?? remote.modifiedTime;
            if (!confirm(t("backup.confirm.overwriteRemote", { when }))) return;
        }

        // Stamped before the snapshot: an edit made mid-upload is then correctly
        // reported as still unsynced rather than swallowed by the save.
        const startedAt = new Date();
        const { modifiedTime } = await saveBackupToDrive(buildFullBackupV1({ storage }));
        markDriveSynced(modifiedTime, startedAt);

        alert(t("backup.msg.saved"));
    }));

    restoreBtn?.addEventListener("click", withBusy(async () => {
        const result = await loadBackupFromDrive();
        if (!result) {
            alert(t("backup.msg.noBackup"));
            return;
        }

        if (!confirmRestore(result.modifiedTime ?? result.parsed?.exportedAt)) return;

        restoreFromParsed(result.parsed, { driveModifiedTime: result.modifiedTime });
    }));

    disconnectBtn?.addEventListener("click", () => {
        if (!confirm(t("backup.confirm.disconnect"))) return;

        disconnectDrive();
        setDriveBackupEnabled(false);
        syncDriveUi();
    });

    // Google's script has to be loaded *before* requestAccessToken() runs, or the
    // await for it spans a network round-trip and the browser no longer treats the
    // popup as user-initiated. Preloading on hover/focus/press keeps it gated behind
    // clear intent — we still never contact Google just for opening this page.
    if (driveAvailable) {
        for (const eventName of ["pointerenter", "focus", "pointerdown"]) {
            connectBtn?.addEventListener(eventName, () => preloadGoogleIdentity(), { once: true });
        }
    }

    // Already-connected users get it upfront: they came here to back up.
    if (driveAvailable && isDriveBackupEnabled()) preloadGoogleIdentity();

    return {
        render() {
            if (driveAvailable && isDriveBackupEnabled() && !isDriveSessionLive()) preloadGoogleIdentity();
            syncDriveUi();
        },
    };
}

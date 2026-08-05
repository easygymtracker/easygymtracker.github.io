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
    isDriveBackupEnabled,
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

    function setStatus(text) {
        if (driveStatusEl) driveStatusEl.textContent = text;
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
            setStatus(t("backup.status.notConnected") || "Not connected");
            return;
        }

        const when = formatWhen(getLastDriveBackupAt());
        setStatus(when
            ? (t("backup.status.lastBackup") || "Last backup: {when}").replace("{when}", when)
            : (t("backup.status.never") || "Connected — no backup yet"));
    }

    function withBusy(fn) {
        return async () => {
            if (busy) return;
            busy = true;
            setStatus(t("backup.busy") || "Working…");
            syncDriveUi();
            try {
                await fn();
            } catch (err) {
                alert((t("backup.msg.error") || "Google Drive error: {message}")
                    .replace("{message}", String(err?.message ?? err)));
            } finally {
                busy = false;
                syncDriveUi();
            }
        };
    }

    function restoreFromParsed(parsed) {
        restoreFullBackup({ parsed, storage });
        alert(t("backup.msg.restored") || "Backup restored. Reloading the app…");
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
                if (!confirm(t("backup.confirm.restore")
                    || "Replace ALL data on this device with this backup? This cannot be undone.")) return;
                restoreFromParsed(String(event.target?.result ?? ""));
            } catch (err) {
                alert((t("backup.msg.error") || "Error: {message}")
                    .replace("{message}", String(err?.message ?? err)));
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
        const { modifiedTime } = await saveBackupToDrive(buildFullBackupV1({ storage }));
        setLastDriveBackupAt(modifiedTime);
        alert(t("backup.msg.saved") || "Backup saved to Google Drive.");
    }));

    restoreBtn?.addEventListener("click", withBusy(async () => {
        const result = await loadBackupFromDrive();
        if (!result) {
            alert(t("backup.msg.noBackup") || "No backup found in your Google Drive.");
            return;
        }

        if (!confirm(t("backup.confirm.restore")
            || "Replace ALL data on this device with this backup? This cannot be undone.")) return;

        restoreFromParsed(result.parsed);
    }));

    disconnectBtn?.addEventListener("click", () => {
        if (!confirm(t("backup.confirm.disconnect")
            || "Disconnect Google Drive? The backup already in your Drive is kept.")) return;

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

// services/googleDriveBackup.js
//
// Optional Google Drive backup. Static-site friendly: Google Identity Services
// issues short-lived access tokens straight to the browser, so there is no
// backend and no client secret. Drive itself is called with plain fetch()
// against its REST API — no heavy gapi client library.
//
// Token lifetime is handled in memory only (see cloudBackupPreference.js).

import {
    GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_SCOPE,
    GOOGLE_DRIVE_BACKUP_FILENAME,
    isGoogleDriveConfigured,
} from "../config/googleDrive.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

// Refresh a little early so a long request can't start with an almost-dead token.
const TOKEN_SAFETY_MARGIN_MS = 60_000;

let gisPromise = null;
let tokenClient = null;
let accessToken = null;
let accessTokenExpiresAt = 0;
let pending = null;

/** Preload the Google script so a later click can open the popup without an await first. */
export function preloadGoogleIdentity() {
    if (!isGoogleDriveConfigured()) return Promise.resolve(false);
    return loadGoogleIdentity().then(() => true).catch(() => false);
}

function loadGoogleIdentity() {
    if (!isGoogleDriveConfigured()) {
        return Promise.reject(new Error("Google Drive is not configured in this build"));
    }
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;

    gisPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
        const script = existing ?? document.createElement("script");

        script.addEventListener("load", () => resolve());
        script.addEventListener("error", () => {
            gisPromise = null;
            reject(new Error("Could not load Google sign-in (offline?)"));
        });

        if (!existing) {
            script.src = GIS_SRC;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
    });

    return gisPromise;
}

function ensureTokenClient() {
    if (tokenClient) return tokenClient;

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: (response) => {
            const settle = pending;
            pending = null;
            if (!settle) return;

            if (response?.error) {
                settle.reject(new Error(response.error_description || response.error));
                return;
            }
            if (!response?.access_token) {
                settle.reject(new Error("Google did not return an access token"));
                return;
            }

            accessToken = response.access_token;
            const ttlMs = (Number(response.expires_in) || 3600) * 1000;
            accessTokenExpiresAt = Date.now() + ttlMs;
            settle.resolve(accessToken);
        },
        error_callback: (err) => {
            const settle = pending;
            pending = null;
            // Fired when the popup is blocked or the user closes it.
            settle?.reject(new Error(err?.type === "popup_closed"
                ? "Google sign-in was cancelled"
                : "Google sign-in could not open (popup blocked?)"));
        },
    });

    return tokenClient;
}

function hasLiveToken() {
    return Boolean(accessToken) && Date.now() < accessTokenExpiresAt - TOKEN_SAFETY_MARGIN_MS;
}

async function getAccessToken() {
    if (hasLiveToken()) return accessToken;

    await loadGoogleIdentity();
    const client = ensureTokenClient();

    if (pending) throw new Error("A Google sign-in is already in progress");

    return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try {
            // Empty prompt: Google skips the consent screen once already granted.
            client.requestAccessToken({ prompt: "" });
        } catch (err) {
            pending = null;
            reject(err);
        }
    });
}

function forgetToken() {
    accessToken = null;
    accessTokenExpiresAt = 0;
}

async function driveFetch(url, options = {}) {
    const token = await getAccessToken();

    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers ?? {}),
        },
    });

    if (response.status === 401 || response.status === 403) {
        // Token revoked or expired early — drop it so the next call re-authorises.
        forgetToken();
    }

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const body = await response.json();
            detail = body?.error?.message || detail;
        } catch {
            // Non-JSON error body; the status is all we have.
        }
        throw new Error(detail);
    }

    return response;
}

/**
 * The app only ever sees files it created (drive.file scope), so a name lookup
 * cannot collide with the user's own documents.
 */
async function findBackupFile() {
    const params = new URLSearchParams({
        q: `name = '${GOOGLE_DRIVE_BACKUP_FILENAME}' and trashed = false`,
        fields: "files(id,name,modifiedTime,size)",
        pageSize: "10",
    });

    const response = await driveFetch(`${DRIVE_FILES}?${params}`);
    const body = await response.json();
    return body?.files?.[0] ?? null;
}

async function createBackupFile() {
    const response = await driveFetch(`${DRIVE_FILES}?fields=id,name,modifiedTime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: GOOGLE_DRIVE_BACKUP_FILENAME,
            mimeType: "application/json",
        }),
    });
    return response.json();
}

/** Prompts for access (and consent on first use), then reports the account state. */
export async function connectDrive() {
    await getAccessToken();
    return { connected: true };
}

export function disconnectDrive() {
    const token = accessToken;
    forgetToken();

    // Best-effort: also drop the grant on Google's side.
    try {
        if (token) window.google?.accounts?.oauth2?.revoke?.(token, () => {});
    } catch {
        // Revocation is a courtesy; local state is already cleared.
    }
}

export function isDriveSessionLive() {
    return hasLiveToken();
}

export async function saveBackupToDrive(payload) {
    const json = JSON.stringify(payload);

    const existing = await findBackupFile();
    const file = existing ?? (await createBackupFile());

    const response = await driveFetch(
        `${DRIVE_UPLOAD}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,modifiedTime`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: json,
        },
    );

    const updated = await response.json();
    return { fileId: updated.id, modifiedTime: updated.modifiedTime ?? new Date().toISOString() };
}

/** Returns null when the account has no backup yet (first device, or user deleted it). */
export async function loadBackupFromDrive() {
    const file = await findBackupFile();
    if (!file) return null;

    const response = await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(file.id)}?alt=media`);
    const text = await response.text();

    return { parsed: JSON.parse(text), modifiedTime: file.modifiedTime ?? null };
}

export async function getDriveBackupMeta() {
    const file = await findBackupFile();
    if (!file) return null;
    return { modifiedTime: file.modifiedTime ?? null, size: Number(file.size) || null };
}

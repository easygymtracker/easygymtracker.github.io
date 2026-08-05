// src/config/googleDrive.js
//
// Google Drive backup is OFF until you paste an OAuth client ID below. Until
// then the app hides the whole Drive feature and stays 100 % local — nothing
// about the UI or the privacy story changes.
//
// One-time setup (no backend, no client secret needed):
//   1. Google Cloud console -> create/pick a project -> enable the "Google Drive API".
//   2. APIs & Services -> OAuth consent screen -> External. Add the scope
//      https://www.googleapis.com/auth/drive.file  (Google documents this as the
//      recommended, non-sensitive Drive scope: per-file access, limited to files
//      this app itself creates or the user explicitly opens with it).
//   3. Credentials -> Create credentials -> OAuth client ID -> Web application.
//      Authorised JavaScript origins:
//        https://easygymtracker.github.io
//        http://localhost:8080          (for local development)
//      Leave "Authorised redirect URIs" empty — the token flow does not use them.
//   4. Paste the generated client ID below.
//
// The client ID is public by design (it ships in this file and is visible in
// devtools); it is not a secret. There is no client secret in this flow.
//
// While the consent screen is in "Testing", only accounts you add as test users
// can connect. Publish it to let anyone use Drive backup.

export const GOOGLE_DRIVE_CLIENT_ID = "";

// Per-file access, limited to files this app creates. Chosen over broader Drive
// scopes so the app can never see the rest of the user's Drive.
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Visible in the user's Drive on purpose: they can see, download and delete the
// backup themselves without trusting the app's word for it.
export const GOOGLE_DRIVE_BACKUP_FILENAME = "easy-gym-tracker-backup.json";

export function isGoogleDriveConfigured() {
    return typeof GOOGLE_DRIVE_CLIENT_ID === "string" && GOOGLE_DRIVE_CLIENT_ID.trim().length > 0;
}

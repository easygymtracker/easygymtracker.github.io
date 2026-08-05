// services/onboardingTour.js
//
// Tracks whether the first-time guided tour has been shown. Kept as a plain
// localStorage flag (like notificationPreference.js) since it's a single
// boolean, not model data.

const STORAGE_KEY = "gymapp_onboarding_tour_seen";

export function hasSeenOnboardingTour() {
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export function markOnboardingTourSeen() {
    localStorage.setItem(STORAGE_KEY, "true");
}

export function resetOnboardingTour() {
    localStorage.removeItem(STORAGE_KEY);
}

import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const { hasSeenOnboardingTour, markOnboardingTourSeen, resetOnboardingTour } =
    await import("../../src/services/onboardingTour.js");

test("tour is unseen by default", () => {
    globalThis.localStorage.clear();
    assert.equal(hasSeenOnboardingTour(), false);
});

test("marking the tour seen persists across reads", () => {
    globalThis.localStorage.clear();
    markOnboardingTourSeen();
    assert.equal(hasSeenOnboardingTour(), true);
});

test("resetting clears the seen flag", () => {
    globalThis.localStorage.clear();
    markOnboardingTourSeen();
    resetOnboardingTour();
    assert.equal(hasSeenOnboardingTour(), false);
});

test("garbage values in storage are treated as unseen", () => {
    globalThis.localStorage.clear();
    globalThis.localStorage.setItem("gymapp_onboarding_tour_seen", "yes");
    assert.equal(hasSeenOnboardingTour(), false);
});

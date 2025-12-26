// internationalization/i18n.js
import { DICTS } from './dicts.js';

function getInitialLocale() {
    const meta = document.querySelector('meta[name="app:locale"]')?.getAttribute("content");
    if (meta && DICTS[meta]) return meta;
    
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("lang");
    if (fromQuery && DICTS[fromQuery]) return fromQuery;

    const stored = localStorage.getItem("lang");
    if (stored && DICTS[stored]) return stored;

    const nav = (navigator.language || "en").split("-")[0];
    return DICTS[nav] ? nav : "en";
};

const state = {
    locale: getInitialLocale()
};

export function setLocale(locale) {
    if (!DICTS[locale]) locale = "en";
    state.locale = locale;
    localStorage.setItem("lang", locale);
    document.documentElement.lang = locale;
    translateDocument();
}

export function getLocale() {
    return state.locale;
}

export function t(key, vars = {}) {
    const dict = DICTS[state.locale] || DICTS.en;
    const fallback = DICTS.en || {};
    let s = dict[key] ?? fallback[key] ?? key;

    s = String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return s;
}

export function translateDocument(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => {
        if (el.hasAttribute("data-i18n-attr")) return;
        el.textContent = t(el.getAttribute("data-i18n"));
    });

    root.querySelectorAll("[data-i18n][data-i18n-attr]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        const attr = el.getAttribute("data-i18n-attr");
        if (!attr) return;
        el.setAttribute(attr, t(key));
    });

    root.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
        el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });

    root.querySelectorAll("[data-i18n-title]").forEach(el => {
        el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });

    const titleEl = root.querySelector("title[data-i18n]");
    if (titleEl) document.title = t(titleEl.getAttribute("data-i18n"));
}

document.documentElement.lang = state.locale;
translateDocument();
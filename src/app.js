// app.js

import { startRouter, navigate } from "./router.js";
import { createRoutineStore } from "./store/routineStore.js";
import { createExerciseStore } from "./store/exerciseStore.js";
import { createProfileStore } from "./store/profileStore.js";
import { registerServiceWorker } from "./app/serviceWorkerBootstrap.js";
import { setupRoutineImport } from "./app/routineImportBootstrap.js";

import { mountSessionPage } from "./pages/sessionPage/sessionPage.js";
import { mountRoutinesPage } from "./pages/routinesPage/routinesPage.js";
import { mountRoutineNewPage } from "./pages/routinesPage/routineNewPage.js";
import { mountRoutineDetailPage } from "./pages/routinesPage/routineDetailPage.js";
import { mountProfilePage } from "./pages/profilePage/profilePage.js";
import { mountProfileHistoryPage } from "./pages/profilePage/profileHistoryPage.js";

import { setLocale, getLocale, getLocaleFromUrl, translateDocument, t } from "./internationalization/i18n.js";

registerServiceWorker();

// -----------------------------------------------------------------------------
// Stores
// -----------------------------------------------------------------------------
const routineStore = createRoutineStore();
const exerciseStore = createExerciseStore();
const profileStore = createProfileStore();

// -----------------------------------------------------------------------------
// Top toolbar actions (global)
// -----------------------------------------------------------------------------
const btnClearAll = document.getElementById("btnClearAll");
const appToolbar = document.getElementById("appToolbar");

btnClearAll.addEventListener("click", () => {
    const ok = confirm(t("confirm.clearAll"));
    if (!ok) return;
    routineStore.clearAll();
    navigate("/routines");
});

const btnUploadRoutine = document.getElementById("btnUploadRoutine");
setupRoutineImport({
    triggerEl: btnUploadRoutine,
    routineStore,
    exerciseStore,
    navigate,
});

// -----------------------------------------------------------------------------
// Mount pages once
// -----------------------------------------------------------------------------
const pages = {
    home: { render() {} },
    features: { render() {} },
    privacy: { render() {} },
    about: { render() {} },
    routines: mountRoutinesPage({ routineStore, exerciseStore }),
    "routine-new": mountRoutineNewPage({ routineStore }),
    routine: mountRoutineDetailPage({ routineStore, exerciseStore }),
    session: mountSessionPage({ routineStore, exerciseStore }),
    profile: mountProfilePage({ profileStore }),
    "profile-history": mountProfileHistoryPage({ profileStore }),
};

const PUBLIC_ROUTES = new Set(["home", "features", "privacy", "about"]);
const SITE_URL = "https://easygymtracker.github.io";

function breadcrumbStructuredData(items) {
    return {
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url,
        })),
    };
}

const ROUTE_SEO = {
    home: {
        robots: "index,follow",
        title: "Easy Gym Routine Tracker | Private workout planner and session tracker",
        description: "Plan routines, track workout sessions, and keep your gym data private on your own device with Easy Gym Routine Tracker.",
        canonical: `${SITE_URL}/`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "SoftwareApplication",
                    name: "Easy Gym Routine Tracker",
                    applicationCategory: "HealthApplication",
                    operatingSystem: "Web",
                    url: `${SITE_URL}/`,
                    description: "A local-first web app for planning gym routines, logging sessions, and tracking progress privately on your own device.",
                    offers: {
                        "@type": "Offer",
                        price: "0",
                        priceCurrency: "USD"
                    },
                    featureList: [
                        "Local-first routine storage",
                        "Workout session tracking",
                        "Unilateral and bilateral set support",
                        "Progress history charts"
                    ]
                },
                {
                    "@type": "Organization",
                    name: "Easy Gym Routine Tracker",
                    url: `${SITE_URL}/`
                },
                {
                    "@type": "WebSite",
                    name: "Easy Gym Routine Tracker",
                    url: `${SITE_URL}/`
                }
            ]
        },
    },
    features: {
        robots: "index,follow",
        title: "Features | Easy Gym Routine Tracker",
        description: "See the core features of Easy Gym Routine Tracker: local-first routine building, session mode, unilateral support, exports, and progress history.",
        canonical: `${SITE_URL}/features`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    name: "Features | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/features`,
                    description: "Feature overview for Easy Gym Routine Tracker."
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "Features", url: `${SITE_URL}/features` },
                ]),
            ]
        },
    },
    privacy: {
        robots: "index,follow",
        title: "Privacy | Easy Gym Routine Tracker",
        description: "Understand the privacy model of Easy Gym Routine Tracker and how workout data is stored locally on your device.",
        canonical: `${SITE_URL}/privacy`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "PrivacyPolicy",
                    name: "Privacy | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/privacy`,
                    description: "Privacy information for Easy Gym Routine Tracker."
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "Privacy", url: `${SITE_URL}/privacy` },
                ]),
            ]
        },
    },
    about: {
        robots: "index,follow",
        title: "How It Works | Easy Gym Routine Tracker",
        description: "Learn how Easy Gym Routine Tracker works: build routines, run sessions, log sets, and track progress — all stored locally on your device.",
        canonical: `${SITE_URL}/about`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    name: "How It Works | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/about`,
                    description: "Step-by-step overview of how Easy Gym Routine Tracker works."
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "How it works", url: `${SITE_URL}/about` },
                ]),
            ]
        },
    },
    routines: { robots: "noindex,nofollow" },
    "routine-new": { robots: "noindex,nofollow" },
    routine: { robots: "noindex,nofollow" },
    session: { robots: "noindex,nofollow" },
    profile: { robots: "noindex,nofollow" },
    "profile-history": { robots: "noindex,nofollow" },
};

// -----------------------------------------------------------------------------
// Routing
// -----------------------------------------------------------------------------
function showRoute(name) {
    document.querySelectorAll(".route").forEach((el) => {
        el.style.display = (el.dataset.route === name) ? "" : "none";
    });

    if (appToolbar) {
        appToolbar.style.display = (name === "routines") ? "flex" : "none";
    }
}

function syncLocaleFromUrl() {
    const locale = getLocaleFromUrl();
    if (locale && locale !== getLocale()) {
        setLocale(locale);
    }
}

function ensureMetaTag(name) {
    let meta = document.head.querySelector(`meta[name="${name}"]`);
    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", name);
        document.head.appendChild(meta);
    }
    return meta;
}

function ensureCanonicalLink() {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
    }
    return link;
}

function ensureMetaProperty(property) {
    let meta = document.head.querySelector(`meta[property="${property}"]`);
    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
    }
    return meta;
}

function ensureStructuredDataScript() {
    let script = document.head.querySelector('script[type="application/ld+json"][data-structured="route"]');
    if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-structured", "route");
        document.head.appendChild(script);
    }
    return script;
}

function applyRouteSeo(name) {
    const meta = ROUTE_SEO[name] ?? { robots: "noindex,nofollow" };
    ensureMetaTag("robots").setAttribute("content", meta.robots);

    ensureMetaTag("description").setAttribute(
        "content",
        meta.description || "Easy Gym Routine Tracker"
    );

    ensureCanonicalLink().setAttribute(
        "href",
        meta.canonical || window.location.origin + window.location.pathname
    );

    const canonical = meta.canonical || window.location.origin + window.location.pathname;
    const title = meta.title || t("app.title");
    const description = meta.description || "Easy Gym Routine Tracker";

    ensureMetaProperty("og:type").setAttribute("content", PUBLIC_ROUTES.has(name) ? "website" : "article");
    ensureMetaProperty("og:title").setAttribute("content", title);
    ensureMetaProperty("og:description").setAttribute("content", description);
    ensureMetaProperty("og:url").setAttribute("content", canonical);
    ensureMetaProperty("og:site_name").setAttribute("content", "Easy Gym Routine Tracker");

    const IMAGE_URL = "https://easygymtracker.github.io/icons/icon-512.png";
    ensureMetaTag("twitter:card").setAttribute("content", "summary_large_image");
    ensureMetaTag("twitter:title").setAttribute("content", title);
    ensureMetaTag("twitter:description").setAttribute("content", description);
    ensureMetaTag("twitter:image").setAttribute("content", IMAGE_URL);
    ensureMetaProperty("og:image").setAttribute("content", IMAGE_URL);

    const structuredScript = ensureStructuredDataScript();
    structuredScript.textContent = meta.structuredData
        ? JSON.stringify(meta.structuredData, null, 2)
        : "";

    document.title = title;
}

startRouter({
    defaultPath: "/",
    onRoute({ name, params }) {
        syncLocaleFromUrl();

        showRoute(name);
        translateDocument(document);
        applyRouteSeo(name);

        const page = pages[name];
        if (page?.render) {
            page.render(params);
        }
    },
});
#!/usr/bin/env node
// scripts/prerender.js
// Generates static HTML snapshots for each public landing route.
// Output: features/index.html, privacy/index.html, about/index.html
//
// Usage: node scripts/prerender.js
// Re-run whenever index.html or route SEO metadata changes.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const OG_IMAGE = "https://easygymtracker.github.io/icons/icon-512.png";
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

const ROUTES = [
    {
        name: "features",
        outDir: "features",
        title: "Features | Easy Gym Routine Tracker",
        description:
            "See the core features of Easy Gym Routine Tracker: local-first routine building, session mode, unilateral support, exports, and progress history.",
        canonical: `${SITE_URL}/features`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    name: "Features | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/features`,
                    description: "Feature overview for Easy Gym Routine Tracker.",
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "Features", url: `${SITE_URL}/features` },
                ]),
            ],
        },
    },
    {
        name: "privacy",
        outDir: "privacy",
        title: "Privacy | Easy Gym Routine Tracker",
        description:
            "Understand the privacy model of Easy Gym Routine Tracker and how workout data is stored locally on your device.",
        canonical: `${SITE_URL}/privacy`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "PrivacyPolicy",
                    name: "Privacy | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/privacy`,
                    description: "Privacy information for Easy Gym Routine Tracker.",
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "Privacy", url: `${SITE_URL}/privacy` },
                ]),
            ],
        },
    },
    {
        name: "terms",
        outDir: "terms",
        title: "Terms of Service | Easy Gym Routine Tracker",
        description:
            "The terms for using Easy Gym Routine Tracker: free, no account, provided as-is, and your workout data stays yours.",
        canonical: `${SITE_URL}/terms`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    name: "Terms of Service | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/terms`,
                    description: "Terms of service for Easy Gym Routine Tracker.",
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "Terms", url: `${SITE_URL}/terms` },
                ]),
            ],
        },
    },
    {
        name: "about",
        outDir: "about",
        title: "How It Works | Easy Gym Routine Tracker",
        description:
            "Learn how Easy Gym Routine Tracker works: build routines, run sessions, log sets, and track progress — all stored locally on your device.",
        canonical: `${SITE_URL}/about`,
        structuredData: {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    name: "How It Works | Easy Gym Routine Tracker",
                    url: `${SITE_URL}/about`,
                    description:
                        "Step-by-step overview of how Easy Gym Routine Tracker works.",
                },
                breadcrumbStructuredData([
                    { name: "Home", url: `${SITE_URL}/` },
                    { name: "How it works", url: `${SITE_URL}/about` },
                ]),
            ],
        },
    },
];

function escapeAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function setSectionVisibility(html, targetRouteName) {
    return html.replace(
        /<section([^>]*\bdata-route="([^"]+)"[^>]*)>/g,
        (full, attrs, routeName) => {
            const hasStyle = /\bstyle="[^"]*"/.test(attrs);
            const isTarget = routeName === targetRouteName;

            if (isTarget) {
                // Remove display:none from the target route (if present).
                let nextAttrs = attrs.replace(/\bstyle="([^"]*)"/g, (m, style) => {
                    const cleaned = style
                        .replace(/display\s*:\s*none\s*;?/gi, "")
                        .replace(/;\s*;/g, ";")
                        .trim();
                    return cleaned ? `style="${cleaned}"` : "";
                });
                nextAttrs = nextAttrs.replace(/\s{2,}/g, " ").trimEnd();
                return `<section${nextAttrs}>`;
            }

            // Hide every non-target route section.
            if (hasStyle) {
                const nextAttrs = attrs.replace(/\bstyle="([^"]*)"/g, (m, style) => {
                    if (/display\s*:\s*none/i.test(style)) return m;
                    const merged = `${style.trim()}${style.trim().endsWith(";") ? "" : ";"} display:none;`;
                    return `style="${merged.trim()}"`;
                });
                return `<section${nextAttrs}>`;
            }

            return `<section${attrs} style="display:none;">`;
        }
    );
}

const src = readFileSync(join(ROOT, "index.html"), "utf8");

for (const route of ROUTES) {
    let html = src;

    // 1. Title
    html = html.replace(
        /<title[^>]*>.*?<\/title>/s,
        `<title>${route.title}</title>`
    );

    // 2. meta description
    html = html.replace(
        /<meta name="description"[^>]*\/>/,
        `<meta name="description" content="${escapeAttr(route.description)}" />`
    );

    // 3. robots  (insert before canonical)
    // Replace the existing robots meta (already present in index.html) and the
    // canonical link in one pass to avoid duplicates.
    html = html.replace(
        /<meta name="robots"[^>]*\/>/,
        `<meta name="robots" content="index,follow" />`
    );
    html = html.replace(
        /<link rel="canonical"[^>]*\/>/,
        `<link rel="canonical" href="${escapeAttr(route.canonical)}" />`
    );

    // 4. OG tags
    html = html.replace(
        /<meta property="og:title"[^>]*\/>/,
        `<meta property="og:title" content="${escapeAttr(route.title)}" />`
    );
    html = html.replace(
        /<meta property="og:description"[^>]*\/>/,
        `<meta property="og:description" content="${escapeAttr(route.description)}" />`
    );
    html = html.replace(
        /<meta property="og:url"[^>]*\/>/,
        `<meta property="og:url" content="${escapeAttr(route.canonical)}" />`
    );
    html = html.replace(
        /<meta property="og:type"[^>]*\/>/,
        `<meta property="og:type" content="website" />`
    );
    html = html.replace(
        /<meta property="og:image"[^>]*\/>/,
        `<meta property="og:image" content="${OG_IMAGE}" />`
    );

    // 5. Twitter tags
    html = html.replace(
        /<meta name="twitter:title"[^>]*\/>/,
        `<meta name="twitter:title" content="${escapeAttr(route.title)}" />`
    );
    html = html.replace(
        /<meta name="twitter:description"[^>]*\/>/,
        `<meta name="twitter:description" content="${escapeAttr(route.description)}" />`
    );
    html = html.replace(
        /<meta name="twitter:image"[^>]*\/>/,
        `<meta name="twitter:image" content="${OG_IMAGE}" />`
    );

    // 6. Structured data
    const sdJson = JSON.stringify(route.structuredData, null, 2)
        .split("\n")
        .join("\n    ");
    html = html.replace(
        /<script type="application\/ld\+json" data-structured="route">[\s\S]*?<\/script>/,
        `<script type="application/ld+json" data-structured="route">\n    ${sdJson}\n  </script>`
    );

    // 7. Remove the SPA path-restore script — not needed in prerendered files
    html = html.replace(
           /\r?\n\r?\n  <script>\r?\n    \(function restoreRouteOnLoad[\s\S]*?\}\)\(\);\r?\n  <\/script>/,
        ""
    );

    // 8. Only expose the target section for this prerendered route.
    html = setSectionVisibility(html, route.name);

    // 9. Fix relative asset paths (we're one level deeper: features/, privacy/, about/)
    html = html.replace(/href="\.\/manifest\.json"/g, 'href="../manifest.json"');
    html = html.replace(/href="\.\/styles\//g, 'href="../styles/');
    html = html.replace(/src="\.\/src\/app\.js"/g, 'src="../src/app.js"');
        // Also fix modulepreload href paths added to index.html.
        html = html.replace(/href="\.\/src\//g, 'href="../src/');

    // 10. Write output
    const outDir = join(ROOT, route.outDir);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), html, "utf8");
    console.log(`✓  ${route.outDir}/index.html`);
}

console.log("Prerender complete.");

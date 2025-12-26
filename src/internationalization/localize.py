#!/usr/bin/env python3
"""
localize.py — generate localized static HTML pages from a template + JS DICTS.

Reads:
  - index.html (template)
  - dicts.js (must contain: export const DICTS = { ... };)

Generates:
  - {out}/{locale}/index.html for each locale in DICTS (default: lang/{locale}/index.html)

Replaces:
  - text content for elements with data-i18n="key" (skips those that also have data-i18n-attr)
  - attribute for elements with data-i18n="key" AND data-i18n-attr="attrName"
  - aria-label for elements with data-i18n-aria-label="key"
  - title attribute for elements with data-i18n-title="key"
  - sets <html lang="...">

SEO:
  - Injects <link rel="canonical" ...>
  - Injects <link rel="alternate" hreflang="..." ...> for all locales + x-default

Locale lock (prevents “flash to English”):
  - Injects: <meta name="app:locale" content="{locale}">

Paths:
  - Rewrites href/src/url(./...) so pages work from nested /lang/{locale}/

Usage:
  python ./src/internationalization/localize.py --index ./index.html --dict ./src/internationalization/dicts.js --out ./lang --base-url https://heictopng.github.io --prefix lang
"""

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Dict, Tuple


# ----------------------------
# Load DICTS reliably via Node
# ----------------------------

def load_dicts_via_node(dict_file: Path, node_helper: Path) -> Dict[str, Dict[str, str]]:
    """
    Uses Node.js to import the ES module and JSON.stringify(DICTS).
    Forces UTF-8 decoding (important on Windows).
    """
    cmd = ["node", str(node_helper), str(dict_file)]

    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",  # use "replace" if you prefer not to hard-fail
    )

    if res.returncode != 0:
        raise ValueError(
            "Failed to load DICTS via Node.\n"
            f"Command: {' '.join(cmd)}\n\n"
            f"STDOUT:\n{res.stdout}\n\nSTDERR:\n{res.stderr}"
        )

    if not res.stdout:
        raise ValueError(
            "Node returned empty stdout. DICTS could not be read.\n"
            f"STDERR:\n{res.stderr}"
        )

    data = json.loads(res.stdout)

    out: Dict[str, Dict[str, str]] = {}
    for locale, d in data.items():
        if isinstance(d, dict):
            out[str(locale)] = {str(k): str(v) for k, v in d.items()}
    return out


# ----------------------------
# HTML utilities
# ----------------------------

def html_escape(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def set_html_lang(html: str, locale: str) -> str:
    if re.search(r"<html\b[^>]*\blang\s*=", html, flags=re.IGNORECASE):
        return re.sub(
            r"(<html\b[^>]*\blang\s*=\s*)(['\"])[^'\"]*(\2)",
            r"\1\2" + locale + r"\3",
            html,
            flags=re.IGNORECASE,
        )
    return re.sub(r"<html\b", f'<html lang="{locale}"', html, count=1, flags=re.IGNORECASE)


def translate_text_nodes_data_i18n(html: str, d: Dict[str, str], fallback: Dict[str, str]) -> str:
    """
    Replace inner text for elements with data-i18n="key", skipping ones with data-i18n-attr.
    """
    pattern = re.compile(
        r'(<(?P<tag>[A-Za-z][\w:-]*)\b(?P<attrs>[^>]*?)\sdata-i18n="(?P<key>[^"]+)"(?P<attrs2>[^>]*?)>)'
        r'(?P<inner>[\s\S]*?)'
        r'(</(?P=tag)>)',
        re.MULTILINE,
    )

    def repl(m: re.Match) -> str:
        opening = m.group(1)
        attrs_all = (m.group("attrs") or "") + (m.group("attrs2") or "")
        if "data-i18n-attr" in attrs_all:
            return m.group(0)

        key = m.group("key")
        val = d.get(key, fallback.get(key, key))

        closing = m.group(7)
        return f"{opening}{html_escape(val)}{closing}"

    return pattern.sub(repl, html)


def set_attribute_for_data_i18n_attr(html: str, d: Dict[str, str], fallback: Dict[str, str]) -> str:
    pattern = re.compile(
        r'<(?P<tag>[A-Za-z][\w:-]*)\b(?P<attrs>[^>]*\sdata-i18n="(?P<key>[^"]+)"[^>]*\sdata-i18n-attr="(?P<attr>[^"]+)"[^>]*)>',
        re.MULTILINE,
    )

    def repl(m: re.Match) -> str:
        tag = m.group("tag")
        attrs = m.group("attrs")
        key = m.group("key")
        attr = m.group("attr")
        val = d.get(key, fallback.get(key, key))
        safe = html_escape(val)

        if re.search(rf'\s{re.escape(attr)}="[^"]*"', attrs, flags=re.IGNORECASE):
            attrs2 = re.sub(
                rf'(\s{re.escape(attr)}=")[^"]*(")',
                rf"\1{safe}\2",
                attrs,
                flags=re.IGNORECASE,
            )
        else:
            attrs2 = attrs + f' {attr}="{safe}"'

        return f"<{tag}{attrs2}>"

    return pattern.sub(repl, html)


def set_attribute_from_data_key(html: str, data_attr: str, real_attr: str,
                                d: Dict[str, str], fallback: Dict[str, str]) -> str:
    pattern = re.compile(
        rf'<(?P<tag>[A-Za-z][\w:-]*)\b(?P<attrs>[^>]*\s{re.escape(data_attr)}="(?P<key>[^"]+)"[^>]*)>',
        re.MULTILINE,
    )

    def repl(m: re.Match) -> str:
        tag = m.group("tag")
        attrs = m.group("attrs")
        key = m.group("key")
        val = d.get(key, fallback.get(key, key))
        safe = html_escape(val)

        if re.search(rf'\s{re.escape(real_attr)}="[^"]*"', attrs, flags=re.IGNORECASE):
            attrs2 = re.sub(
                rf'(\s{re.escape(real_attr)}=")[^"]*(")',
                rf"\1{safe}\2",
                attrs,
                flags=re.IGNORECASE,
            )
        else:
            attrs2 = attrs + f' {real_attr}="{safe}"'

        return f"<{tag}{attrs2}>"

    return pattern.sub(repl, html)


def rewrite_relative_paths_for_nested(html: str, nested_depth: int) -> str:
    prefix = "../" * nested_depth
    html = re.sub(r'(\s(?:href|src)=["\'])\./', rf"\1{prefix}", html)
    html = re.sub(r'(\burl\(["\']?)\./', rf"\1{prefix}", html)
    return html


def remove_existing_hreflang_and_canonical(html: str) -> str:
    html = re.sub(
        r'^\s*<link[^>]*rel=["\']canonical["\'][^>]*>\s*\n?',
        "",
        html,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    html = re.sub(
        r'^\s*<link[^>]*rel=["\']alternate["\'][^>]*hreflang=["\'][^"\']+["\'][^>]*>\s*\n?',
        "",
        html,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    return html


def build_hreflang_block(base_url: str, prefix: str, locales: Tuple[str, ...],
                         locale: str, x_default: str = "en") -> str:
    base_url = base_url.rstrip("/")
    prefix = prefix.strip("/")

    def url_for(loc: str) -> str:
        if prefix:
            return f"{base_url}/{prefix}/{loc}/"
        return f"{base_url}/{loc}/"

    canonical = url_for(locale)

    lines = [
        "  <!-- SEO: canonical + hreflang alternates -->",
        f'  <link rel="canonical" href="{canonical}" />',
    ]
    for loc in locales:
        lines.append(f'  <link rel="alternate" hreflang="{loc}" href="{url_for(loc)}" />')
    if x_default in locales:
        lines.append(f'  <link rel="alternate" hreflang="x-default" href="{url_for(x_default)}" />')

    return "\n".join(lines) + "\n"


def inject_before_head_close(html: str, injection: str) -> str:
    if not re.search(r"</head>", html, flags=re.IGNORECASE):
        raise ValueError("Could not find </head> to inject hreflang/canonical.")
    return re.sub(r"</head>", injection + "</head>", html, flags=re.IGNORECASE, count=1)


def inject_locale_meta(html: str, locale: str) -> str:
    """
    Inserts: <meta name="app:locale" content="{locale}">
    right after the viewport meta if present, otherwise after <meta charset>, otherwise after <head>.
    Removes any existing app:locale meta first to avoid duplicates.
    """
    html = re.sub(
        r'^\s*<meta\s+name=["\']app:locale["\'][^>]*>\s*\n?',
        "",
        html,
        flags=re.IGNORECASE | re.MULTILINE,
    )

    meta_line = f'  <meta name="app:locale" content="{html_escape(locale)}" />\n'

    viewport_re = re.compile(r'(<meta\b[^>]*name=["\']viewport["\'][^>]*>\s*)', re.IGNORECASE)
    if viewport_re.search(html):
        return viewport_re.sub(r"\1\n" + meta_line, html, count=1)

    charset_re = re.compile(r'(<meta\b[^>]*charset=["\'][^"\']+["\'][^>]*>\s*)', re.IGNORECASE)
    if charset_re.search(html):
        return charset_re.sub(r"\1\n" + meta_line, html, count=1)

    return re.sub(r"(<head\b[^>]*>\s*)", r"\1\n" + meta_line, html, flags=re.IGNORECASE, count=1)


def inject_base_href(html: str, nested_depth: int) -> str:
    # Remove existing <base ...> if any
    html = re.sub(r'^\s*<base\b[^>]*>\s*\n?', "", html, flags=re.IGNORECASE | re.MULTILINE)

    prefix = "../" * nested_depth
    base_line = f'  <base href="{prefix}" />\n'

    # Insert after viewport meta if present, else right after <head>
    viewport_re = re.compile(r'(<meta\b[^>]*name=["\']viewport["\'][^>]*>\s*)', re.IGNORECASE)
    if viewport_re.search(html):
        return viewport_re.sub(r"\1\n" + base_line, html, count=1)

    return re.sub(r"(<head\b[^>]*>\s*)", r"\1\n" + base_line, html, flags=re.IGNORECASE, count=1)


# ----------------------------
# Main
# ----------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", default="index.html", help="Path to source index.html")
    ap.add_argument("--dict", dest="dict_path", default="i18.js", help="Path to dicts.js containing export const DICTS")
    ap.add_argument("--out", default="lang", help="Output root directory (e.g., lang)")
    ap.add_argument("--base-url", required=True, help="Public base URL, e.g. https://heictopng.github.io")
    ap.add_argument("--prefix", default="lang", help="URL prefix for localized pages (default: lang)")
    ap.add_argument("--x-default", default="en", help="Default language for hreflang x-default (default: en)")
    ap.add_argument("--node-helper", default="src/internationalization/read_dicts.mjs",
                    help="Path to Node helper that imports dicts.js and prints DICTS as JSON")
    args = ap.parse_args()

    index_path = Path(args.index)
    dict_path = Path(args.dict_path)
    out_root = Path(args.out)
    node_helper = Path(args.node_helper)

    if not index_path.exists():
        raise FileNotFoundError(f"index.html not found: {index_path}")
    if not dict_path.exists():
        raise FileNotFoundError(f"dicts file not found: {dict_path}")
    if not node_helper.exists():
        raise FileNotFoundError(
            f"Node helper not found: {node_helper}\n"
            f"Create it at that path or pass --node-helper <path>."
        )

    index_html = index_path.read_text(encoding="utf-8")
    dicts = load_dicts_via_node(dict_path, node_helper)

    if "en" not in dicts:
        raise ValueError("DICTS must include an 'en' fallback locale for best results.")

    fallback = dicts["en"]
    locales = tuple(dicts.keys())

    # Output is {out}/{locale}/index.html.
    # If out="lang", file is lang/{locale}/index.html -> to root is ../../ (2 levels)
    nested_depth = 2
    index_html = inject_base_href(index_html, nested_depth=nested_depth)

    # prevent duplicating canonical/hreflang if template already has them
    index_html = remove_existing_hreflang_and_canonical(index_html)

    for locale in locales:
        d = dicts[locale]
        html = index_html

        html = set_html_lang(html, locale)
        html = inject_locale_meta(html, locale)

        html = set_attribute_for_data_i18n_attr(html, d, fallback)
        html = set_attribute_from_data_key(html, "data-i18n-aria-label", "aria-label", d, fallback)
        html = set_attribute_from_data_key(html, "data-i18n-title", "title", d, fallback)
        html = translate_text_nodes_data_i18n(html, d, fallback)

        html = rewrite_relative_paths_for_nested(html, nested_depth=nested_depth)

        hreflang_block = build_hreflang_block(
            base_url=args.base_url,
            prefix=args.prefix,
            locales=locales,
            locale=locale,
            x_default=args.x_default,
        )
        html = inject_before_head_close(html, hreflang_block)

        out_dir = out_root / locale
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(html, encoding="utf-8")
        print(f"✅ wrote {out_dir / 'index.html'}")

    print("Done.")


if __name__ == "__main__":
    main()
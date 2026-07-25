#!/usr/bin/env python3
"""Fill empty/partial locale JSON files from en.json via Google Translate."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator
from deep_translator.exceptions import TranslationNotFound

ROOT = Path(__file__).resolve().parents[1]
LOCALE_DIR = ROOT / "src" / "i18n" / "locales"
EN_PATH = LOCALE_DIR / "en.json"

# App locale code -> Google Translate target code
GOOGLE_TARGET = {
    "hi": "hi",
    "bn": "bn",
    "te": "te",
    "mr": "mr",
    "ta": "ta",
    "ur": "ur",
    "gu": "gu",
    "kn": "kn",
    "or": "or",
    "ml": "ml",
    "pa": "pa",
    "as": "as",
    "mai": "mai",
    "sa": "sa",
    "ne": "ne",
    "sd": "sd",
    "doi": "doi",
    "kok": "gom",  # Konkani
    "mni": "mni-Mtei",  # Manipuri / Meitei
    # Google has no dedicated targets; closest available
    "ks": "ur",  # Kashmiri → Urdu (shared Perso-Arabic orthography)
    "sat": "hi",  # Santali → Hindi interim
    "brx": "hi",  # Bodo → Hindi interim
}

PLACEHOLDER_RE = re.compile(r"\{[a-zA-Z0-9_]+\}")
BATCH = 30
SLEEP = 0.35
MAX_RETRIES = 5


def protect(text: str) -> tuple[str, list[str]]:
    tokens: list[str] = []

    def repl(m: re.Match[str]) -> str:
        tokens.append(m.group(0))
        return f"__PH{len(tokens) - 1}__"

    return PLACEHOLDER_RE.sub(repl, text), tokens


def restore(text: str, tokens: list[str]) -> str:
    out = text
    for i, tok in enumerate(tokens):
        for variant in (f"__PH{i}__", f"__ph{i}__", f"__ PH{i}__", f"__PH {i}__"):
            if variant in out:
                out = out.replace(variant, tok)
                break
        else:
            # Soft restore if translator mangled tokens
            out = re.sub(rf"__\s*PH\s*{i}\s*__", tok, out, flags=re.I)
    return out


def translate_batch(translator: GoogleTranslator, texts: list[str]) -> list[str]:
    protected: list[str] = []
    token_lists: list[list[str]] = []
    for t in texts:
        p, toks = protect(t)
        protected.append(p)
        token_lists.append(toks)

    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            raw = translator.translate_batch(protected)
            if not isinstance(raw, list) or len(raw) != len(protected):
                raise RuntimeError(f"unexpected batch size: {len(raw) if isinstance(raw, list) else type(raw)}")
            return [restore(r or "", toks) for r, toks in zip(raw, token_lists)]
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    # Fallback one-by-one
    out: list[str] = []
    for p, toks in zip(protected, token_lists):
        try:
            out.append(restore(translator.translate(p) or p, toks))
        except Exception:
            out.append(restore(p, toks))
        time.sleep(SLEEP)
    if last_err:
        print(f"  warn: batch failed ({last_err}); used per-item fallback", flush=True)
    return out


def fill_locale(code: str, en: dict[str, str], only_missing: bool = False) -> None:
    path = LOCALE_DIR / f"{code}.json"
    existing: dict[str, str] = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8")) or {}
        except json.JSONDecodeError:
            existing = {}

    target = GOOGLE_TARGET.get(code)
    if not target:
        print(f"skip {code}: no google target", flush=True)
        return

    if only_missing:
        todo_keys = [k for k in en if k not in existing or not str(existing.get(k) or "").strip()]
    else:
        # Full fill for empty catalogs; also fill missing keys if partially done
        if len(existing) >= len(en) * 0.9:
            todo_keys = [k for k in en if k not in existing or not str(existing.get(k) or "").strip()]
        else:
            todo_keys = list(en.keys())
            existing = {}

    if not todo_keys:
        print(f"{code}: already complete ({len(existing)} keys)", flush=True)
        return

    print(f"{code}: translating {len(todo_keys)} keys via '{target}'…", flush=True)
    translator = GoogleTranslator(source="en", target=target)
    result = dict(existing)

    for i in range(0, len(todo_keys), BATCH):
        chunk_keys = todo_keys[i : i + BATCH]
        chunk_vals = [en[k] for k in chunk_keys]
        translated = translate_batch(translator, chunk_vals)
        for k, v in zip(chunk_keys, translated):
            result[k] = v if v.strip() else en[k]
        # Keep source key order
        ordered = {k: result[k] for k in en if k in result}
        path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        done = min(i + BATCH, len(todo_keys))
        print(f"  {code}: {done}/{len(todo_keys)}", flush=True)
        time.sleep(SLEEP)

    print(f"{code}: done ({len(ordered)} keys)", flush=True)


def main() -> int:
    en = json.loads(EN_PATH.read_text(encoding="utf-8"))
    # New / empty first, then top-up existing
    emptyish = [
        "ur", "or", "pa", "as", "mai", "sa", "ks", "ne", "sd", "kok", "doi", "mni", "sat", "brx",
    ]
    existing = ["hi", "bn", "te", "mr", "ta", "gu", "kn", "ml"]

    args = sys.argv[1:]
    if args:
        for code in args:
            fill_locale(code, en, only_missing=False)
    else:
        for code in emptyish:
            fill_locale(code, en, only_missing=False)
        for code in existing:
            fill_locale(code, en, only_missing=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

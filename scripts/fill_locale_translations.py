#!/usr/bin/env python3
"""Fill empty/partial locale JSON files from en.json via Google Translate."""
from __future__ import annotations

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

from deep_translator import GoogleTranslator
from deep_translator.exceptions import TranslationNotFound

ROOT = Path(__file__).resolve().parents[1]
LOCALE_DIR = ROOT / "src" / "i18n" / "locales"
EN_PATH = LOCALE_DIR / "en.json"
# The English each locale was last translated from. Without it, rewording an
# English string leaves every locale showing the old wording for ever: the key
# still exists, so a missing-keys pass walks straight past it.
SNAPSHOT_PATH = LOCALE_DIR / "en.translated.json"

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
    # The rest of the shipped languages. These used to live in
    # generate-europe-locales.js, which always retranslated every key and needed
    # a node package nobody had installed, so both sets fill from here now.
    "ar": "ar",
    "zh": "zh-CN",
    "ru": "ru",
    "es": "es",
    "de": "de",
    "fr": "fr",
    "it": "it",
    "pt": "pt",
    "nl": "nl",
    "pl": "pl",
    "sv": "sv",
    "ro": "ro",
    "el": "el",
    "cs": "cs",
    "hu": "hu",
    "fi": "fi",
    "da": "da",
    "nb": "no",
    "uk": "uk",
    "bg": "bg",
    "hr": "hr",
    "sk": "sk",
    "sl": "sl",
    "lt": "lt",
    "lv": "lv",
    "et": "et",
    "ga": "ga",
    "mt": "mt",
    "ja": "ja",
    "ko": "ko",
    "sw": "sw",
    "am": "am",
    "ha": "ha",
    "yo": "yo",
    "zu": "zu",
    "af": "af",
    "ig": "ig",
    "sn": "sn",
    "so": "so",
    "xh": "xh",
}

PLACEHOLDER_RE = re.compile(r"\{[a-zA-Z0-9_]+\}")
BATCH = 30
MAX_RETRIES = 4

# Google allows about five requests a second and then starts refusing. Every
# request in the process passes through one throttle, so raising --workers makes
# the languages take turns rather than pushing past the limit together.
MIN_INTERVAL = 0.25
_rate_lock = Lock()
_last_call = [0.0]


def throttle() -> None:
    with _rate_lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.monotonic()


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


def translate_texts(
    translator: GoogleTranslator, texts: list[str]
) -> list[str | None]:
    """
    Translate one string at a time, returning None for anything that would not
    come through.

    A failure has to stay None rather than fall back to the English source: a key
    holding English still counts as filled, so the next run would skip it and the
    gap would never be found again.
    """
    out: list[str | None] = []
    for text in texts:
        masked, tokens = protect(text)
        value: str | None = None
        for attempt in range(MAX_RETRIES):
            throttle()
            try:
                raw = translator.translate(masked)
                if raw and raw.strip():
                    value = restore(raw, tokens)
                    break
            except Exception:  # noqa: BLE001
                # Nearly always the rate limit; back off and let others through.
                time.sleep(1.5 * (attempt + 1))
        out.append(value)
    return out


def stale_keys(en: dict[str, str], snapshot: dict[str, str]) -> list[str]:
    """Keys whose English wording moved on since the locales were built."""
    return [k for k, v in en.items() if k in snapshot and snapshot[k] != v]


def fill_locale(
    code: str,
    en: dict[str, str],
    only_missing: bool = True,
    force: set[str] | None = None,
) -> None:
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

    forced = force or set()
    todo_keys = [
        k
        for k in en
        if k not in existing or not str(existing.get(k) or "").strip() or k in forced
    ]
    if not only_missing:
        # Deliberate full redo, e.g. after fixing the English wording.
        todo_keys = list(en.keys())
        existing = {}

    if not todo_keys:
        print(f"{code}: already complete ({len(existing)} keys)", flush=True)
        return

    print(f"{code}: translating {len(todo_keys)} keys via '{target}'…", flush=True)
    translator = GoogleTranslator(source="en", target=target)
    result = dict(existing)

    skipped = 0
    ordered = {k: result[k] for k in en if k in result}
    for i in range(0, len(todo_keys), BATCH):
        chunk_keys = todo_keys[i : i + BATCH]
        translated = translate_texts(translator, [en[k] for k in chunk_keys])
        for k, v in zip(chunk_keys, translated):
            # A translation that lost or invented a {placeholder} renders as a gap
            # in the sentence or as literal braces. Leave it out and try next time.
            same_slots = v is not None and sorted(PLACEHOLDER_RE.findall(v)) == sorted(
                PLACEHOLDER_RE.findall(en[k])
            )
            if v is None or not same_slots:
                skipped += 1
                continue
            result[k] = v
        # Keep source key order
        ordered = {k: result[k] for k in en if k in result}
        path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        done = min(i + BATCH, len(todo_keys))
        print(f"  {code}: {done}/{len(todo_keys)}", flush=True)

    tail = f", {skipped} left for next run" if skipped else ""
    print(f"{code}: done ({len(ordered)} keys{tail})", flush=True)


def main() -> int:
    """
    Top up every shipped language with the keys it is missing.

    Adding English copy without running this leaves those strings in English for
    everyone, whatever language they picked, because the lookup falls back to en
    silently. Run it after any change to en.json.

    Usage:
      python3 scripts/fill_locale_translations.py               # top up all
      python3 scripts/fill_locale_translations.py --workers=4
      python3 scripts/fill_locale_translations.py de sv         # only these
      python3 scripts/fill_locale_translations.py --all de      # redo de fully
      python3 scripts/fill_locale_translations.py --keys=a.b,c.d
    """
    en = json.loads(EN_PATH.read_text(encoding="utf-8"))
    args = sys.argv[1:]
    only_missing = "--all" not in args
    codes = [a for a in args if not a.startswith("--")] or sorted(GOOGLE_TARGET)
    workers = 1
    for a in args:
        if a.startswith("--workers="):
            workers = max(1, int(a.split("=", 1)[1]))

    snapshot: dict[str, str] = {}
    if SNAPSHOT_PATH.exists():
        try:
            snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8")) or {}
        except json.JSONDecodeError:
            snapshot = {}
    force = set(stale_keys(en, snapshot))
    for a in args:
        if a.startswith("--keys="):
            force |= {k for k in a.split("=", 1)[1].split(",") if k}
    if force:
        print(f"reworded since last run, retranslating: {len(force)} key(s)", flush=True)

    failed: list[str] = []
    lock = Lock()

    def run(code: str) -> None:
        try:
            fill_locale(code, en, only_missing=only_missing, force=force)
        except Exception as e:  # noqa: BLE001
            # One unreachable language must not strand the other sixty-one.
            print(f"{code}: FAILED ({e})", flush=True)
            with lock:
                failed.append(code)

    if workers > 1:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(run, codes))
    else:
        for code in codes:
            run(code)

    if failed:
        print(f"\nfailed: {', '.join(failed)}", flush=True)
        return 1

    # Only claim the snapshot once every language actually came through, so a
    # half-finished run cannot hide the remaining work from the next one.
    if set(codes) >= set(GOOGLE_TARGET) and only_missing:
        SNAPSHOT_PATH.write_text(
            json.dumps(en, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"recorded English snapshot ({len(en)} keys)", flush=True)
    print("\nall locales topped up", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

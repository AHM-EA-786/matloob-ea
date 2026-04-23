# Build Notes — Resources Auto-Updater

**Built:** 2026-04-21  
**Seed count:** 48 items (30 IRS, 18 MA DOR)

---

## What Was Built

### 1. `scripts/update_resources.py`

Self-contained Python 3 script (dependencies: `feedparser`, `requests`, `beautifulsoup4`, `lxml`) that:

- Fetches IRS newsroom via RSS feeds and HTML scraping
- Adds 24 evergreen IRS publications and forms (hardcoded, always current)
- Fetches MA DOR TIRs, Directives, news, and 2025 personal income tax forms via HTML scraping
- Deduplicates all items by URL
- Applies 2-year age filter to news/guidance; keeps forms/publications indefinitely
- Writes atomically (`.tmp` file + `os.rename`)
- Handles all source failures gracefully — logs to stderr, preserves existing items
- Supports `--dry-run` flag to preview without writing
- Configurable via `RESOURCES_OUTPUT`, `RESOURCES_USER_AGENT`, `RESOURCES_MAX_ITEMS` env vars
- Prints summary of added/updated/removed/total at end

### 2. `scripts/requirements.txt`

```
feedparser>=6.0
requests>=2.31
beautifulsoup4>=4.12
lxml>=4.9
```

### 3. `scripts/README.md`

Covers: install, manual run, dry-run, environment variables, cron setup, sources, output format.

### 4. `server/data/resources.json`

Pre-populated with **48 verified, real items** from official `.gov` sources.

---

## Seed Data Breakdown

| Category | IRS | MA DOR | Total |
|---|---|---|---|
| publications | 15 | 0 | 15 |
| forms | 8 | 7 | 15 |
| guidance | 1 (Circular 230) | 11 (TIRs + 1 Directive) | 12 |
| news | 6 | 0 | 6 |
| **Total** | **30** | **18** | **48** |

### IRS Items Included

**Publications (direct PDF links):**
- Pub 17 (2025), Pub 15 (2026), Pub 334, Pub 463, Pub 505 (2026), Pub 527, Pub 541, Pub 544, Pub 550, Pub 559, Pub 590-A, Pub 590-B, Pub 946, Pub 4557, Pub 1345

**Guidance:**
- Circular 230 (pcir230.pdf)

**Forms (instruction PDFs):**
- Form 1040 instructions (i1040gi.pdf), Form 1120, Form 1120-S, Form 1065, Form 2848, Form 8821, Form W-9, Form W-4 (2026)

**News (recent):**
- IR-2026-49 (No Tax on Tips final regs), IR-2026-46 (Business Tax Account expansion), IR-2026-30 (Dirty Dozen 2026), IR-2025-103 (2026 inflation adjustments), IR-2026-12 (2026 filing season opens), IR-2026-06 (100% bonus depreciation guidance)

### MA DOR Items Included

**TIRs:** TIR 26-1, TIR 25-9, TIR 25-8, TIR 25-7, TIR 25-5, TIR 25-3, TIR 25-1, TIR 24-16, TIR 24-14, TIR 24-4

**Directive:** Directive 25-1

**Forms:** Form 1 Instructions (2025), Form 1 (2025), Form 1-NR/PY (2025), Schedule HC, Schedule B, Schedule C, Form M-4868

---

## URL Verification

All URLs were verified to return HTTP 200 at build time:
- IRS PDF URLs follow the pattern `https://www.irs.gov/pub/irs-pdf/p{N}.pdf` and `f{form}.pdf`
- IRS newsroom URLs confirmed via web research and direct fetch
- MA DOR TIR/directive URLs confirmed via direct fetch
- MA DOR form download URLs confirmed via `curl -I` (HTTP 200)

---

## Known Behaviors

- IRS RSS feeds sometimes return slightly malformed XML. The script logs a warning but continues — feedparser handles these gracefully.
- MA DOR pages may return 403 from some IP ranges. The script logs to stderr and preserves existing items from the seed. This is expected in locked-down environments.
- The MA DOR pages respond normally from typical server IPs (confirmed via fetch_url tool during build).

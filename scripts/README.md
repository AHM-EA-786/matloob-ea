# Resources Auto-Updater

A self-hosted Python 3 script that fetches the latest IRS and Massachusetts DOR tax resources and writes them to `server/data/resources.json` for the EA portal to display.

## Self-hosted

This script runs on the **same server as the portal**. It requires outbound internet access to reach `irs.gov` and `mass.gov`.

---

## Requirements

- Python 3.10+
- pip packages: `feedparser`, `requests`, `beautifulsoup4`, `lxml`

---

## Install Dependencies

```bash
cd /srv/ea-portal
pip3 install -r scripts/requirements.txt
```

Or in a virtual environment:

```bash
cd /srv/ea-portal
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

---

## Run Manually

```bash
# From the repo root
cd /srv/ea-portal
python3 scripts/update_resources.py
```

### Dry Run (preview without writing)

```bash
python3 scripts/update_resources.py --dry-run
```

### Override output path

```bash
python3 scripts/update_resources.py --output /tmp/test_resources.json
```

---

## Configure via Environment Variables

| Variable | Default | Description |
|---|---|---|
| `RESOURCES_OUTPUT` | `server/data/resources.json` | Output JSON path (relative to repo root or absolute) |
| `RESOURCES_USER_AGENT` | `Matloob-EA-Portal/1.0 (+https://matloob-ea.com)` | HTTP User-Agent sent to IRS/DOR servers |
| `RESOURCES_MAX_ITEMS` | `200` | Maximum items kept in the JSON file |

Example:

```bash
RESOURCES_OUTPUT=/var/www/ea-portal/server/data/resources.json \
python3 scripts/update_resources.py
```

---

## Set Up Cron (Automatic Updates)

Run every 6 hours:

```bash
crontab -e
```

Add this line (adjust paths for your server):

```
0 */6 * * * cd /srv/ea-portal && /usr/bin/python3 scripts/update_resources.py >> logs/resources.log 2>&1
```

Or to run daily at 6:00 AM:

```
0 6 * * * cd /srv/ea-portal && /usr/bin/python3 scripts/update_resources.py >> logs/resources.log 2>&1
```

Create the logs directory first:

```bash
mkdir -p /srv/ea-portal/logs
```

### Using a virtual environment with cron

```
0 6 * * * cd /srv/ea-portal && .venv/bin/python3 scripts/update_resources.py >> logs/resources.log 2>&1
```

---

## Sources

### IRS
- **Newsroom RSS** — `https://www.irs.gov/rss-feeds/tax-news`
- **Tax Professionals RSS** — `https://www.irs.gov/rss-feeds/news-and-announcements-for-tax-professionals`
- **Newsroom (current month)** — `https://www.irs.gov/newsroom/news-releases-for-current-month`
- **Forms & Publications** — `https://www.irs.gov/forms-pubs`
- **Evergreen publications** — Publications 17, 15, 334, 463, 505, 527, 541, 544, 550, 559, 590-A, 590-B, 946, 4557, 1345; Circular 230; Form instructions for 1040, 1120, 1120-S, 1065, 2848, 8821, W-9, W-4

### Massachusetts DOR
- **Technical Information Releases (TIRs)** — `https://www.mass.gov/lists/dor-technical-information-releases`
- **Directives** — `https://www.mass.gov/lists/dor-directives`
- **News** — `https://www.mass.gov/orgs/massachusetts-department-of-revenue/news`
- **2025 Personal Income Tax Forms** — `https://www.mass.gov/lists/2025-massachusetts-personal-income-tax-forms-and-instructions`

---

## Script Behavior

- **Deduplicates** by URL — each URL appears at most once
- **Atomic write** — writes to `.tmp` then renames to avoid corrupt files
- **Safe defaults** — if a source fails, logs to stderr and preserves existing items
- **Age filtering** — news and guidance items older than 2 years are removed; forms and publications are kept indefinitely
- **`lastCheckedAt`** is updated on every run for all items
- **`--dry-run`** previews changes without writing

---

## Output Format

`server/data/resources.json`:

```json
{
  "lastUpdated": "2026-04-21T06:00:00Z",
  "items": [
    {
      "id": "irs-pub-17-2025",
      "source": "IRS",
      "category": "publications",
      "title": "Publication 17 (2025): Your Federal Income Tax",
      "summary": "Comprehensive guide for individuals...",
      "url": "https://www.irs.gov/pub/irs-pdf/p17.pdf",
      "pubDate": "2026-01-13",
      "isPinned": true,
      "lastCheckedAt": "2026-04-21T06:00:00Z"
    }
  ]
}
```

**Categories:** `news`, `publications`, `forms`, `guidance`

**Sources:** `IRS`, `MA DOR`

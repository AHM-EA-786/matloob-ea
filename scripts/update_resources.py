#!/usr/bin/env python3
"""
Matloob EA Portal — Resources Auto-Updater

Fetches the latest IRS and Massachusetts DOR tax resources and writes
them to server/data/resources.json for the portal to display.

Usage:
    python3 update_resources.py
    python3 update_resources.py --dry-run

Configuration via environment variables:
    RESOURCES_OUTPUT       Path to output JSON file (default: server/data/resources.json)
    RESOURCES_USER_AGENT   HTTP User-Agent header (default: Matloob-EA-Portal/1.0)
    RESOURCES_MAX_ITEMS    Maximum items to keep (default: 200)

Cron (every 6 hours):
    0 */6 * * * cd /srv/ea-portal && /usr/bin/python3 scripts/update_resources.py >> logs/resources.log 2>&1
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import feedparser
import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

OUTPUT_PATH = Path(
    os.environ.get("RESOURCES_OUTPUT", str(REPO_ROOT / "server" / "data" / "resources.json"))
)
USER_AGENT = os.environ.get(
    "RESOURCES_USER_AGENT", "Matloob-EA-Portal/1.0 (+https://matloob-ea.com)"
)
MAX_ITEMS = int(os.environ.get("RESOURCES_MAX_ITEMS", "200"))

REQUEST_TIMEOUT = 15  # seconds
MAX_NEWS_AGE_DAYS = 730  # 2 years — keep news/TIRs no older than this


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def url_to_id(source_prefix: str, url: str) -> str:
    """Generate a stable ID from source prefix + URL hash."""
    digest = hashlib.sha256(url.encode()).hexdigest()[:10]
    return f"{source_prefix}-{digest}"


def parse_date(date_str: str) -> str:
    """Normalize various date formats to YYYY-MM-DD. Returns '' on failure."""
    if not date_str:
        return ""
    # Already YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str
    # ISO 8601 with time
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", date_str)
    if m:
        return m.group(1)
    # feedparser time struct
    if hasattr(date_str, "tm_year"):
        try:
            return f"{date_str.tm_year:04d}-{date_str.tm_mon:02d}-{date_str.tm_mday:02d}"
        except Exception:
            pass
    # Try common formats
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def is_recent(pub_date: str, max_days: int) -> bool:
    """Return True if pub_date is within max_days of today, or if date is empty."""
    if not pub_date:
        return True  # keep if we can't determine age
    try:
        dt = datetime.strptime(pub_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_days)
        return dt >= cutoff
    except ValueError:
        return True


def get_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    })
    return s


def safe_get(session: requests.Session, url: str) -> requests.Response | None:
    """GET with timeout and error logging. Returns None on failure."""
    try:
        r = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        r.raise_for_status()
        return r
    except requests.RequestException as exc:
        print(f"  [WARN] Failed to fetch {url}: {exc}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# IRS Sources
# ---------------------------------------------------------------------------

IRS_RSS_FEEDS = [
    # IRS Newsroom RSS
    "https://www.irs.gov/rss-feeds/tax-news",
    # IRS Tax Professionals
    "https://www.irs.gov/rss-feeds/news-and-announcements-for-tax-professionals",
]

IRS_NEWSROOM_PAGES = [
    "https://www.irs.gov/newsroom/news-releases-for-current-month",
]

def fetch_irs_rss(session: requests.Session) -> list[dict]:
    """Fetch IRS newsroom RSS feeds."""
    items = []
    for feed_url in IRS_RSS_FEEDS:
        try:
            print(f"  Fetching IRS RSS: {feed_url}")
            feed = feedparser.parse(feed_url)
            if feed.bozo:
                print(f"  [WARN] RSS minor parse issue for {feed_url}: {feed.bozo_exception}", file=sys.stderr)
                if not feed.entries:
                    continue  # completely empty / broken feed — skip
            for entry in feed.entries:
                url = entry.get("link", "").strip()
                if not url:
                    continue
                pub_date = ""
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    pub_date = parse_date(entry.published_parsed)
                elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                    pub_date = parse_date(entry.updated_parsed)
                elif entry.get("published"):
                    pub_date = parse_date(entry.get("published", ""))

                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                # Strip HTML tags from summary
                if summary:
                    summary = BeautifulSoup(summary, "lxml").get_text(" ", strip=True)[:300]

                items.append({
                    "id": url_to_id("irs-nr", url),
                    "source": "IRS",
                    "category": "news",
                    "title": title,
                    "summary": summary,
                    "url": url,
                    "pubDate": pub_date,
                    "isPinned": False,
                    "lastCheckedAt": now_utc(),
                })
        except Exception as exc:
            print(f"  [ERROR] IRS RSS {feed_url}: {exc}", file=sys.stderr)
    return items


def fetch_irs_newsroom_html(session: requests.Session) -> list[dict]:
    """Scrape IRS newsroom HTML pages for news releases."""
    items = []
    for page_url in IRS_NEWSROOM_PAGES:
        print(f"  Fetching IRS newsroom page: {page_url}")
        resp = safe_get(session, page_url)
        if not resp:
            continue
        try:
            soup = BeautifulSoup(resp.text, "lxml")
            # IRS newsroom uses h3 + p pattern inside article or main content
            for h in soup.find_all(["h3", "h2"]):
                a = h.find("a")
                if not a or not a.get("href"):
                    continue
                href = a["href"].strip()
                if not href.startswith("http"):
                    href = "https://www.irs.gov" + href
                if "/newsroom/" not in href:
                    continue
                title = a.get_text(strip=True)
                # Try to get sibling text for date/summary
                summary = ""
                nxt = h.find_next_sibling()
                if nxt:
                    summary = nxt.get_text(" ", strip=True)[:250]
                # Extract date from summary (IR-YYYY-NNN pattern)
                pub_date = ""
                date_m = re.search(r"(\w+ \d+,\s*\d{4})", summary)
                if date_m:
                    pub_date = parse_date(date_m.group(1))

                items.append({
                    "id": url_to_id("irs-nr", href),
                    "source": "IRS",
                    "category": "news",
                    "title": title,
                    "summary": summary,
                    "url": href,
                    "pubDate": pub_date,
                    "isPinned": False,
                    "lastCheckedAt": now_utc(),
                })
        except Exception as exc:
            print(f"  [ERROR] Parsing {page_url}: {exc}", file=sys.stderr)
    return items


# Static evergreen IRS publications and forms — these are permanent and don't expire.
# URLs are direct deep links to official IRS PDFs.
IRS_EVERGREEN = [
    # Publications
    {
        "id": "irs-pub-17-2025",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 17 (2025): Your Federal Income Tax",
        "summary": "Comprehensive tax guide for individuals covering filing requirements, income, deductions, and credits for tax year 2025.",
        "url": "https://www.irs.gov/pub/irs-pdf/p17.pdf",
        "pubDate": "2026-01-13",
        "isPinned": True,
    },
    {
        "id": "irs-pub-15-2026",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 15 (2026): Employer's Tax Guide (Circular E)",
        "summary": "Employer's guide covering payroll taxes, withholding, depositing, and reporting federal employment taxes.",
        "url": "https://www.irs.gov/pub/irs-pdf/p15.pdf",
        "pubDate": "2025-12-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-334-2025",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 334 (2025): Tax Guide for Small Business (Schedule C)",
        "summary": "Tax guide for sole proprietors and individuals filing Schedule C, covering business income, deductions, and recordkeeping.",
        "url": "https://www.irs.gov/pub/irs-pdf/p334.pdf",
        "pubDate": "2026-02-10",
        "isPinned": False,
    },
    {
        "id": "irs-pub-463-2025",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 463 (2025): Travel, Gift, and Car Expenses",
        "summary": "Covers deductibility of business travel, meals, gifts, and vehicle expenses including standard mileage rates.",
        "url": "https://www.irs.gov/pub/irs-pdf/p463.pdf",
        "pubDate": "2026-01-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-505-2026",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 505 (2026): Tax Withholding and Estimated Tax",
        "summary": "Explains income tax withholding for employees and estimated tax requirements for self-employed individuals.",
        "url": "https://www.irs.gov/pub/irs-pdf/p505.pdf",
        "pubDate": "2026-03-31",
        "isPinned": False,
    },
    {
        "id": "irs-pub-527-2025",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 527 (2025): Residential Rental Property",
        "summary": "Tax rules for residential rental property owners, including depreciation, expenses, and vacation home rules.",
        "url": "https://www.irs.gov/pub/irs-pdf/p527.pdf",
        "pubDate": "2026-01-08",
        "isPinned": False,
    },
    {
        "id": "irs-pub-541-2024",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 541: Partnerships",
        "summary": "Guide covering partnership taxation, formation, operations, distributions, and partner allocations.",
        "url": "https://www.irs.gov/pub/irs-pdf/p541.pdf",
        "pubDate": "2025-03-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-544-2024",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 544: Sales and Other Dispositions of Assets",
        "summary": "Explains how to figure gain or loss on various sales and dispositions of property, including capital gains rules.",
        "url": "https://www.irs.gov/pub/irs-pdf/p544.pdf",
        "pubDate": "2025-02-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-550-2024",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 550: Investment Income and Expenses",
        "summary": "Covers taxable and nontaxable investment income, investment expenses, wash sales, and reporting requirements.",
        "url": "https://www.irs.gov/pub/irs-pdf/p550.pdf",
        "pubDate": "2025-03-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-559-2024",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 559: Survivors, Executors, and Administrators",
        "summary": "Tax information for the survivors, executors, and administrators of decedents' estates.",
        "url": "https://www.irs.gov/pub/irs-pdf/p559.pdf",
        "pubDate": "2025-03-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-590a-2025",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 590-A (2025): Contributions to Individual Retirement Arrangements (IRAs)",
        "summary": "Covers IRA contribution limits, deductibility, rollovers, and the rules for traditional and Roth IRAs.",
        "url": "https://www.irs.gov/pub/irs-pdf/p590a.pdf",
        "pubDate": "2026-02-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-590b-2025",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 590-B (2025): Distributions from Individual Retirement Arrangements (IRAs)",
        "summary": "Explains rules for IRA distributions, including required minimum distributions, early withdrawal penalties, and rollovers.",
        "url": "https://www.irs.gov/pub/irs-pdf/p590b.pdf",
        "pubDate": "2026-03-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-946-2024",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 946: How to Depreciate Property",
        "summary": "Explains MACRS depreciation, Section 179 expensing, bonus depreciation, and listed property rules.",
        "url": "https://www.irs.gov/pub/irs-pdf/p946.pdf",
        "pubDate": "2025-03-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-4557",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 4557: Safeguarding Taxpayer Data",
        "summary": "IRS guide for tax professionals on protecting client data and maintaining a written information security plan.",
        "url": "https://www.irs.gov/pub/irs-pdf/p4557.pdf",
        "pubDate": "2024-01-01",
        "isPinned": False,
    },
    {
        "id": "irs-pub-1345",
        "source": "IRS",
        "category": "publications",
        "title": "Publication 1345: Handbook for Authorized IRS e-file Providers",
        "summary": "Official handbook for EROs and transmitters on requirements, procedures, and responsibilities for IRS e-file.",
        "url": "https://www.irs.gov/pub/irs-pdf/p1345.pdf",
        "pubDate": "2025-01-01",
        "isPinned": False,
    },
    {
        "id": "irs-circular-230",
        "source": "IRS",
        "category": "guidance",
        "title": "Circular 230: Regulations Governing Practice Before the IRS",
        "summary": "Treasury regulations (31 CFR Part 10) governing practice before the IRS, including duties, restrictions, and sanctions for tax professionals.",
        "url": "https://www.irs.gov/pub/irs-pdf/pcir230.pdf",
        "pubDate": "2024-06-01",
        "isPinned": True,
    },
    # Forms
    {
        "id": "irs-form-1040-instr-2025",
        "source": "IRS",
        "category": "forms",
        "title": "Form 1040 Instructions (2025)",
        "summary": "Official instructions for filing Form 1040 and 1040-SR for tax year 2025.",
        "url": "https://www.irs.gov/pub/irs-pdf/i1040gi.pdf",
        "pubDate": "2026-01-01",
        "isPinned": True,
    },
    {
        "id": "irs-form-1120-instr",
        "source": "IRS",
        "category": "forms",
        "title": "Form 1120 Instructions: U.S. Corporation Income Tax Return",
        "summary": "Instructions for C corporations filing Form 1120 federal income tax return.",
        "url": "https://www.irs.gov/pub/irs-pdf/i1120.pdf",
        "pubDate": "2025-12-01",
        "isPinned": False,
    },
    {
        "id": "irs-form-1120s-instr",
        "source": "IRS",
        "category": "forms",
        "title": "Form 1120-S Instructions: U.S. Income Tax Return for an S Corporation",
        "summary": "Instructions for S corporations filing Form 1120-S, including shareholder basis, distributions, and AAA.",
        "url": "https://www.irs.gov/pub/irs-pdf/i1120s.pdf",
        "pubDate": "2025-12-01",
        "isPinned": False,
    },
    {
        "id": "irs-form-1065-instr",
        "source": "IRS",
        "category": "forms",
        "title": "Form 1065 Instructions: U.S. Return of Partnership Income",
        "summary": "Instructions for partnerships and LLCs filing Form 1065, including Schedule K-1 allocations.",
        "url": "https://www.irs.gov/pub/irs-pdf/i1065.pdf",
        "pubDate": "2025-12-01",
        "isPinned": False,
    },
    {
        "id": "irs-form-2848",
        "source": "IRS",
        "category": "forms",
        "title": "Form 2848: Power of Attorney and Declaration of Representative",
        "summary": "Authorizes a representative (such as an EA or CPA) to act on a taxpayer's behalf before the IRS.",
        "url": "https://www.irs.gov/pub/irs-pdf/f2848.pdf",
        "pubDate": "2024-01-01",
        "isPinned": True,
    },
    {
        "id": "irs-form-8821",
        "source": "IRS",
        "category": "forms",
        "title": "Form 8821: Tax Information Authorization",
        "summary": "Authorizes a designee to inspect or receive confidential tax information for the specified tax matters.",
        "url": "https://www.irs.gov/pub/irs-pdf/f8821.pdf",
        "pubDate": "2024-01-01",
        "isPinned": False,
    },
    {
        "id": "irs-form-w9",
        "source": "IRS",
        "category": "forms",
        "title": "Form W-9: Request for Taxpayer Identification Number and Certification",
        "summary": "Used to request the TIN of a U.S. person for information reporting on payments such as 1099s.",
        "url": "https://www.irs.gov/pub/irs-pdf/fw9.pdf",
        "pubDate": "2024-03-01",
        "isPinned": False,
    },
    {
        "id": "irs-form-w4-2026",
        "source": "IRS",
        "category": "forms",
        "title": "Form W-4 (2026): Employee's Withholding Certificate",
        "summary": "Used by employees to tell their employer how much federal income tax to withhold from each paycheck.",
        "url": "https://www.irs.gov/pub/irs-pdf/fw4.pdf",
        "pubDate": "2025-12-01",
        "isPinned": False,
    },
]

def fetch_irs_forms_updates(session: requests.Session) -> list[dict]:
    """
    Fetch recent form/publication updates from IRS forms & pubs page.
    Returns any newly updated items found.
    """
    items = []
    url = "https://www.irs.gov/forms-pubs"
    print(f"  Fetching IRS forms & pubs: {url}")
    resp = safe_get(session, url)
    if not resp:
        return items
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        # Look for "Recently Updated" section
        for h in soup.find_all(["h2", "h3"]):
            if "recent" in h.get_text(strip=True).lower():
                # Grab next ul or table
                nxt = h.find_next_sibling(["ul", "table", "div"])
                if nxt:
                    for a in nxt.find_all("a", href=True):
                        href = a["href"].strip()
                        if not href.startswith("http"):
                            href = "https://www.irs.gov" + href
                        title = a.get_text(strip=True)
                        if not title:
                            continue
                        items.append({
                            "id": url_to_id("irs-form", href),
                            "source": "IRS",
                            "category": "forms",
                            "title": title,
                            "summary": f"Recently updated IRS form or publication: {title}",
                            "url": href,
                            "pubDate": "",
                            "isPinned": False,
                            "lastCheckedAt": now_utc(),
                        })
                break
    except Exception as exc:
        print(f"  [ERROR] Parsing IRS forms page: {exc}", file=sys.stderr)
    return items


# ---------------------------------------------------------------------------
# MA DOR Sources
# ---------------------------------------------------------------------------

MA_DOR_TIR_LIST_URL = "https://www.mass.gov/lists/dor-technical-information-releases"
MA_DOR_DIRECTIVE_LIST_URL = "https://www.mass.gov/lists/dor-directives"
MA_DOR_NEWS_URL = "https://www.mass.gov/orgs/massachusetts-department-of-revenue/news"
MA_DOR_FORMS_2025_URL = "https://www.mass.gov/lists/2025-massachusetts-personal-income-tax-forms-and-instructions"


def fetch_ma_tirs(session: requests.Session) -> list[dict]:
    """Fetch MA DOR TIR list and return recent items."""
    items = []
    print(f"  Fetching MA DOR TIRs: {MA_DOR_TIR_LIST_URL}")
    resp = safe_get(session, MA_DOR_TIR_LIST_URL)
    if not resp:
        return items
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        # Find all links to technical-information-release pages
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if "/technical-information-release/" not in href:
                continue
            if not href.startswith("http"):
                href = "https://www.mass.gov" + href
            # Skip non-specific links (e.g. the page header)
            slug = href.split("/technical-information-release/")[-1]
            if not slug or slug == "tir":
                continue
            title = a.get_text(strip=True)
            if not title:
                # Try parent element text
                title = (a.parent or a).get_text(strip=True)
            if not title:
                continue
            # Extract TIR number for better ID
            tir_m = re.match(r"(tir-\d+-\d+)", slug, re.IGNORECASE)
            item_id = tir_m.group(1).lower() if tir_m else url_to_id("ma-tir", href)
            items.append({
                "id": item_id,
                "source": "MA DOR",
                "category": "guidance",
                "title": title,
                "summary": f"Massachusetts DOR Technical Information Release. See full text at official Mass.gov page.",
                "url": href,
                "pubDate": "",
                "isPinned": False,
                "lastCheckedAt": now_utc(),
            })
    except Exception as exc:
        print(f"  [ERROR] Parsing MA TIR list: {exc}", file=sys.stderr)
    return items


def fetch_ma_directives(session: requests.Session) -> list[dict]:
    """Fetch MA DOR directives list."""
    items = []
    print(f"  Fetching MA DOR directives: {MA_DOR_DIRECTIVE_LIST_URL}")
    resp = safe_get(session, MA_DOR_DIRECTIVE_LIST_URL)
    if not resp:
        return items
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if "/directive/" not in href:
                continue
            if not href.startswith("http"):
                href = "https://www.mass.gov" + href
            slug = href.split("/directive/")[-1]
            if not slug:
                continue
            title = a.get_text(strip=True)
            if not title:
                continue
            dir_m = re.match(r"directive-(\d+-\d+)", slug, re.IGNORECASE)
            item_id = f"ma-dd-{dir_m.group(1)}" if dir_m else url_to_id("ma-dd", href)
            items.append({
                "id": item_id,
                "source": "MA DOR",
                "category": "guidance",
                "title": title,
                "summary": "Massachusetts DOR Directive. States official DOR policy and has precedent status.",
                "url": href,
                "pubDate": "",
                "isPinned": False,
                "lastCheckedAt": now_utc(),
            })
    except Exception as exc:
        print(f"  [ERROR] Parsing MA directives: {exc}", file=sys.stderr)
    return items


def fetch_ma_news(session: requests.Session) -> list[dict]:
    """Fetch MA DOR news page."""
    items = []
    print(f"  Fetching MA DOR news: {MA_DOR_NEWS_URL}")
    resp = safe_get(session, MA_DOR_NEWS_URL)
    if not resp:
        return items
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            # MA news pages follow /news/* pattern
            if not re.search(r"/news/", href):
                continue
            if "orgs/massachusetts-department-of-revenue" in href:
                continue  # skip nav links
            if not href.startswith("http"):
                href = "https://www.mass.gov" + href
            title = a.get_text(strip=True)
            if not title or len(title) < 10:
                continue
            items.append({
                "id": url_to_id("ma-news", href),
                "source": "MA DOR",
                "category": "news",
                "title": title,
                "summary": "Massachusetts DOR news release.",
                "url": href,
                "pubDate": "",
                "isPinned": False,
                "lastCheckedAt": now_utc(),
            })
    except Exception as exc:
        print(f"  [ERROR] Parsing MA news: {exc}", file=sys.stderr)
    return items


def fetch_ma_forms(session: requests.Session) -> list[dict]:
    """Fetch MA DOR personal income tax forms for 2025."""
    items = []
    print(f"  Fetching MA DOR forms: {MA_DOR_FORMS_2025_URL}")
    resp = safe_get(session, MA_DOR_FORMS_2025_URL)
    if not resp:
        return items
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            # Forms are PDFs via /doc/*/download
            if "/doc/" not in href or "/download" not in href:
                continue
            if not href.startswith("http"):
                href = "https://www.mass.gov" + href
            title = a.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            # Extract form slug for ID
            slug_m = re.search(r"/doc/([^/]+)/download", href)
            item_id = f"ma-form-{slug_m.group(1)}" if slug_m else url_to_id("ma-form", href)
            items.append({
                "id": item_id,
                "source": "MA DOR",
                "category": "forms",
                "title": title,
                "summary": f"2025 Massachusetts DOR form: {title}",
                "url": href,
                "pubDate": "2026-01-22",
                "isPinned": False,
                "lastCheckedAt": now_utc(),
            })
    except Exception as exc:
        print(f"  [ERROR] Parsing MA forms: {exc}", file=sys.stderr)
    return items


# ---------------------------------------------------------------------------
# Dedup and merge
# ---------------------------------------------------------------------------

def build_lookup(items: list[dict]) -> dict[str, dict]:
    """Build a URL-keyed lookup dict from a list of items."""
    return {item["url"]: item for item in items}


def merge_items(
    existing: list[dict],
    fresh: list[dict],
    now: str,
) -> tuple[list[dict], int, int, int]:
    """
    Merge fresh items into existing, deduplicating by URL.
    Returns (merged_list, added, updated, removed).
    """
    existing_by_url = build_lookup(existing)
    fresh_by_url = build_lookup(fresh)

    added = 0
    updated = 0

    result: dict[str, dict] = {}

    # Start from existing — update lastCheckedAt
    for url, item in existing_by_url.items():
        if url in fresh_by_url:
            # Update with fresh data, preserve isPinned from existing if set
            fresh_item = fresh_by_url[url].copy()
            if existing_by_url[url].get("isPinned"):
                fresh_item["isPinned"] = True
            # Preserve pubDate if fresh doesn't have one
            if not fresh_item.get("pubDate") and item.get("pubDate"):
                fresh_item["pubDate"] = item["pubDate"]
            fresh_item["lastCheckedAt"] = now
            result[url] = fresh_item
            updated += 1
        else:
            # Keep existing item — just update lastCheckedAt
            item = item.copy()
            item["lastCheckedAt"] = now
            result[url] = item

    # Add truly new items
    for url, item in fresh_by_url.items():
        if url not in existing_by_url:
            item = item.copy()
            item["lastCheckedAt"] = now
            result[url] = item
            added += 1

    # Apply age filter: only for news/guidance categories, not forms/publications
    before_filter = len(result)
    filtered: dict[str, dict] = {}
    for url, item in result.items():
        cat = item.get("category", "")
        if cat in ("news", "guidance"):
            if is_recent(item.get("pubDate", ""), MAX_NEWS_AGE_DAYS):
                filtered[url] = item
        else:
            filtered[url] = item

    removed_by_age = before_filter - len(filtered)

    # Sort by pubDate descending, then by lastCheckedAt
    def sort_key(item):
        pd = item.get("pubDate") or "0000-00-00"
        lc = item.get("lastCheckedAt") or ""
        return (pd, lc)

    sorted_items = sorted(filtered.values(), key=sort_key, reverse=True)

    # Cap total
    if len(sorted_items) > MAX_ITEMS:
        removed_by_age += len(sorted_items) - MAX_ITEMS
        sorted_items = sorted_items[:MAX_ITEMS]

    removed = removed_by_age

    return sorted_items, added, updated, removed


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_existing(path: Path) -> dict:
    """Load existing resources.json. Returns empty structure on missing/corrupt."""
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                # Old format (plain array)
                return {"lastUpdated": "", "items": data}
            return data
        except Exception as exc:
            print(f"[WARN] Could not read existing {path}: {exc}", file=sys.stderr)
    return {"lastUpdated": "", "items": []}


def atomic_write(path: Path, data: dict) -> None:
    """Write JSON atomically via a temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    tmp.rename(path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fetch IRS + MA DOR resources and update resources.json"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be written without modifying the file",
    )
    parser.add_argument(
        "--output",
        help=f"Override output path (default: {OUTPUT_PATH})",
    )
    args = parser.parse_args()

    output_path = Path(args.output) if args.output else OUTPUT_PATH
    now = now_utc()

    print(f"=== Matloob EA Resources Updater — {now} ===")
    print(f"Output: {output_path}")

    # Load existing data
    existing_data = load_existing(output_path)
    existing_items: list[dict] = existing_data.get("items", [])
    print(f"Loaded {len(existing_items)} existing items")

    # Collect fresh items from all sources
    session = get_session()
    fresh_items: list[dict] = []

    # ---- IRS ----
    print("\n[IRS] Fetching newsroom RSS...")
    try:
        fresh_items.extend(fetch_irs_rss(session))
    except Exception as exc:
        print(f"  [ERROR] IRS RSS: {exc}", file=sys.stderr)

    print("\n[IRS] Fetching newsroom HTML...")
    try:
        fresh_items.extend(fetch_irs_newsroom_html(session))
    except Exception as exc:
        print(f"  [ERROR] IRS newsroom HTML: {exc}", file=sys.stderr)

    print("\n[IRS] Adding evergreen publications and forms...")
    for item in IRS_EVERGREEN:
        item_copy = item.copy()
        item_copy["lastCheckedAt"] = now
        fresh_items.append(item_copy)

    print("\n[IRS] Fetching forms & pubs recent updates...")
    try:
        fresh_items.extend(fetch_irs_forms_updates(session))
    except Exception as exc:
        print(f"  [ERROR] IRS forms updates: {exc}", file=sys.stderr)

    # ---- MA DOR ----
    print("\n[MA DOR] Fetching TIRs...")
    try:
        fresh_items.extend(fetch_ma_tirs(session))
    except Exception as exc:
        print(f"  [ERROR] MA TIRs: {exc}", file=sys.stderr)

    print("\n[MA DOR] Fetching directives...")
    try:
        fresh_items.extend(fetch_ma_directives(session))
    except Exception as exc:
        print(f"  [ERROR] MA directives: {exc}", file=sys.stderr)

    print("\n[MA DOR] Fetching news...")
    try:
        fresh_items.extend(fetch_ma_news(session))
    except Exception as exc:
        print(f"  [ERROR] MA news: {exc}", file=sys.stderr)

    print("\n[MA DOR] Fetching 2025 personal income tax forms...")
    try:
        fresh_items.extend(fetch_ma_forms(session))
    except Exception as exc:
        print(f"  [ERROR] MA forms: {exc}", file=sys.stderr)

    print(f"\nFetched {len(fresh_items)} total items (with duplicates)")

    # Merge
    merged, added, updated, removed = merge_items(existing_items, fresh_items, now)

    irs_count = sum(1 for i in merged if i.get("source") == "IRS")
    ma_count = sum(1 for i in merged if i.get("source") == "MA DOR")

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Summary:")
    print(f"  Added:   {added}")
    print(f"  Updated: {updated}")
    print(f"  Removed: {removed}")
    print(f"  Total:   {len(merged)} ({irs_count} IRS, {ma_count} MA DOR)")

    output_data = {
        "lastUpdated": now,
        "items": merged,
    }

    if args.dry_run:
        print("\n[DRY RUN] Would write:")
        print(json.dumps(output_data, indent=2)[:2000] + "\n...(truncated)")
    else:
        atomic_write(output_path, output_data)
        print(f"\nWrote {len(merged)} items to {output_path}")

    print(
        "\nTo schedule automatic updates every 6 hours, add this to your crontab (run `crontab -e`):\n"
        f"  0 */6 * * * cd /srv/ea-portal && /usr/bin/python3 scripts/update_resources.py"
        f" >> logs/resources.log 2>&1"
    )


if __name__ == "__main__":
    main()

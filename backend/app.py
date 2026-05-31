"""
Anti-Hoax Civic Alert Gateway — Flask Backend
==============================================

A REST API that stores, serves, and cryptographically verifies civic
alerts for Bhopal city.  Citizens can query the /api/verify endpoint
with free-text messages to check whether a rumour matches any
officially-issued alert.

Run:
    pip install -r requirements.txt
    python app.py

The server starts on http://localhost:5000
"""

import os
import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from functools import wraps

from flask import Flask, g, jsonify, request
from flask_cors import CORS

from crypto_utils import generate_alert_hash, generate_verification_proof

# ═══════════════════════════════════════════════════════════════════
# App configuration
# ═══════════════════════════════════════════════════════════════════

app = Flask(__name__)
CORS(app)

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alerts.db")

# Track how many verification queries have been processed (in-memory).
_verified_queries_count = 0


# ═══════════════════════════════════════════════════════════════════
# Database helpers
# ═══════════════════════════════════════════════════════════════════

def get_db() -> sqlite3.Connection:
    """Return a per-request SQLite connection stored on Flask's *g*."""
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the alerts table if it doesn't already exist."""
    conn = sqlite3.connect(DATABASE)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            description TEXT NOT NULL,
            source      TEXT NOT NULL,
            severity    TEXT NOT NULL CHECK(severity IN ('critical','warning','info')),
            category    TEXT NOT NULL,
            issued_at   TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            sha256_hash TEXT NOT NULL,
            is_active   INTEGER NOT NULL DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()


def row_to_dict(row: sqlite3.Row) -> dict:
    """Convert a sqlite3.Row to a plain dict."""
    return dict(row)


# ═══════════════════════════════════════════════════════════════════
# Seed data — realistic Bhopal civic alerts
# ═══════════════════════════════════════════════════════════════════

def _now():
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def seed_alerts():
    """Insert 14 realistic mock alerts for Bhopal city if table is empty."""
    conn = sqlite3.connect(DATABASE)
    count = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    if count > 0:
        conn.close()
        return

    now = _now()

    alerts = [
        # ── Monsoon / Flooding ──────────────────────────────────────
        {
            "title": "Severe Waterlogging on Hoshangabad Road",
            "description": (
                "Heavy rainfall has caused severe waterlogging on Hoshangabad Road "
                "between Habibganj Railway Station and Misrod Square. Water level "
                "has reached 2 feet in low-lying stretches. Commuters are advised "
                "to use VIP Road or Kolar Road as alternatives. NDRF teams have "
                "been deployed near Piplani underpass."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "critical",
            "category": "flood",
            "issued_at": _iso(now - timedelta(hours=3)),
            "expires_at": _iso(now + timedelta(hours=21)),
        },
        {
            "title": "Upper Lake Water Level Rising — Bhadbhada Gate Alert",
            "description": (
                "Upper Lake (Bada Talab) water level has crossed 1666.20 ft. "
                "Bhadbhada spillway gates may be opened within the next 6 hours. "
                "Residents in downstream Kaliasot and Bhadbhada areas should stay "
                "alert and move valuables to higher ground. Emergency helpline: 0755-2770199."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "critical",
            "category": "flood",
            "issued_at": _iso(now - timedelta(hours=1)),
            "expires_at": _iso(now + timedelta(hours=23)),
        },
        {
            "title": "Lower Lake Overflow Warning for Surrounding Colonies",
            "description": (
                "Lower Lake (Chhota Talab) near Kamla Park is overflowing due to "
                "continuous rainfall. Water has entered parts of Jehangirabad and "
                "Peer Gate areas. BMC relief teams are distributing sandbags. "
                "Residents should avoid walking through stagnant water."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "warning",
            "category": "flood",
            "issued_at": _iso(now - timedelta(hours=5)),
            "expires_at": _iso(now + timedelta(hours=19)),
        },

        # ── Traffic / BRTS ──────────────────────────────────────────
        {
            "title": "BRTS Corridor Diversion — Berasia Road Section",
            "description": (
                "Due to a road cave-in near Karond Square, BRTS bus routes 4 and 7 "
                "are diverted via Lalghati–Jahangirabad corridor until further "
                "notice. Passengers should board from temporary stops at Lalghati "
                "and Roshanpura. Estimated delay: 15–20 minutes."
            ),
            "source": "Bhopal City Police",
            "severity": "warning",
            "category": "traffic",
            "issued_at": _iso(now - timedelta(hours=8)),
            "expires_at": _iso(now + timedelta(days=2)),
        },
        {
            "title": "Traffic Diversion at MP Nagar Zone-I for Repair Work",
            "description": (
                "MP Nagar Zone-I main road (DB Mall to Zone-I Square) is closed "
                "for urgent sewer line repair. Traffic is diverted via Arera Colony "
                "E-5 Road. Expect heavy congestion during peak hours (8–10 AM and "
                "5–8 PM). Work expected to complete by June 3."
            ),
            "source": "Bhopal City Police",
            "severity": "warning",
            "category": "traffic",
            "issued_at": _iso(now - timedelta(hours=12)),
            "expires_at": _iso(now + timedelta(days=3)),
        },

        # ── Public Health ───────────────────────────────────────────
        {
            "title": "Dengue Alert — Increased Cases in South Bhopal",
            "description": (
                "Bhopal Health Department reports a 35% rise in dengue cases in "
                "Ayodhya Nagar, Govindpura, and Bagsewania wards. Fogging drives "
                "are scheduled daily from 6–8 AM. Citizens must eliminate standing "
                "water in coolers, tyres, and pots. Free testing is available at "
                "Hamidia Hospital and JP Hospital."
            ),
            "source": "Bhopal Health Department",
            "severity": "warning",
            "category": "health",
            "issued_at": _iso(now - timedelta(days=1)),
            "expires_at": _iso(now + timedelta(days=6)),
        },
        {
            "title": "Water Contamination Advisory — Shahpura Zone",
            "description": (
                "Water samples from Shahpura Zone (wards 45–50) have tested "
                "positive for elevated coliform levels. Residents are advised to "
                "boil drinking water until further notice. Tanker supply with "
                "treated water has been arranged — contact helpline 1800-233-0755. "
                "PHE department is flushing mains."
            ),
            "source": "Bhopal Health Department",
            "severity": "critical",
            "category": "health",
            "issued_at": _iso(now - timedelta(hours=10)),
            "expires_at": _iso(now + timedelta(days=4)),
        },

        # ── Power Outages ──────────────────────────────────────────
        {
            "title": "Scheduled Power Outage — Arera Colony & Shivaji Nagar",
            "description": (
                "MPPKVVCL announces a scheduled power shutdown on June 1 from "
                "10:00 AM to 4:00 PM in Arera Colony (E-1 to E-8 sectors) and "
                "Shivaji Nagar for transformer upgrade work. Hospitals and water "
                "pumping stations will be on DG backup. Please charge devices "
                "beforehand."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "info",
            "category": "power",
            "issued_at": _iso(now - timedelta(days=1)),
            "expires_at": _iso(now + timedelta(days=1)),
        },
        {
            "title": "Emergency Power Restoration — TT Nagar Area",
            "description": (
                "An underground cable fault has caused unscheduled power outage in "
                "TT Nagar, Shyamla Hills, and Riviera Towne. Repair crews are on "
                "site. Estimated restoration: 4–6 hours. For emergencies, call "
                "MPPKVVCL helpline 1912."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "warning",
            "category": "power",
            "issued_at": _iso(now - timedelta(hours=2)),
            "expires_at": _iso(now + timedelta(hours=6)),
        },

        # ── Road Closures ──────────────────────────────────────────
        {
            "title": "Road Closure — New Market to Roshanpura for Civic Event",
            "description": (
                "New Market Road from Lal Parade Ground to Roshanpura Square will "
                "be closed on June 1 from 7:00 AM to 2:00 PM for a civic marathon "
                "event. Vehicles must use the Sultania Road–Board Office bypass. "
                "Parking available at Lal Parade Ground basement."
            ),
            "source": "Bhopal City Police",
            "severity": "info",
            "category": "road_closure",
            "issued_at": _iso(now - timedelta(hours=18)),
            "expires_at": _iso(now + timedelta(hours=14)),
        },
        {
            "title": "Road Closure — Arera Colony E-3 Bridge Structural Audit",
            "description": (
                "Arera Colony E-3 overbridge is closed for a 48-hour structural "
                "safety audit after cracks were reported. Light vehicles may use "
                "the E-5 underpass. Heavy vehicles must route via 10 No. Market "
                "Stop. BMC structural engineers are on site."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "critical",
            "category": "road_closure",
            "issued_at": _iso(now - timedelta(hours=6)),
            "expires_at": _iso(now + timedelta(hours=42)),
        },

        # ── Weather Warnings ───────────────────────────────────────
        {
            "title": "IMD Orange Alert — Heavy Rainfall Expected in Bhopal",
            "description": (
                "India Meteorological Department (IMD) has issued an Orange Alert "
                "for Bhopal district. Very heavy rainfall (115–204 mm) is expected "
                "over the next 24 hours. Winds gusting up to 50 km/h likely. "
                "Citizens should avoid waterlogged roads, stay indoors, and keep "
                "emergency kits ready. Schools may remain closed — await official "
                "notification."
            ),
            "source": "India Meteorological Department",
            "severity": "critical",
            "category": "weather",
            "issued_at": _iso(now - timedelta(hours=2)),
            "expires_at": _iso(now + timedelta(hours=22)),
        },
        {
            "title": "Thunderstorm Warning for Bhopal & Sehore Districts",
            "description": (
                "IMD warns of thunderstorms with lightning and hail between 4 PM "
                "and 10 PM today across Bhopal, Sehore, and Raisen districts. "
                "Avoid open fields, tall trees, and metallic structures. Secure "
                "loose rooftop items. Farmers should protect harvested crops."
            ),
            "source": "India Meteorological Department",
            "severity": "warning",
            "category": "weather",
            "issued_at": _iso(now - timedelta(hours=4)),
            "expires_at": _iso(now + timedelta(hours=6)),
        },

        # ── Miscellaneous ──────────────────────────────────────────
        {
            "title": "Gas Leak Evacuation — BHEL Industrial Area",
            "description": (
                "A minor chlorine gas leak has been detected at the BHEL water "
                "treatment plant. Residents within a 500-metre radius in BHEL "
                "Colony Sector-A should evacuate immediately. NDRF and fire "
                "brigade are on site. Temporary shelter is set up at BHEL Club. "
                "Situation is being monitored; updates every 30 minutes."
            ),
            "source": "Bhopal Municipal Corporation",
            "severity": "critical",
            "category": "hazard",
            "issued_at": _iso(now - timedelta(minutes=45)),
            "expires_at": _iso(now + timedelta(hours=12)),
        },
    ]

    for alert in alerts:
        alert["id"] = str(uuid.uuid4())
        alert["sha256_hash"] = generate_alert_hash(alert)
        alert["is_active"] = 1

    conn.executemany(
        """
        INSERT INTO alerts
            (id, title, description, source, severity, category,
             issued_at, expires_at, sha256_hash, is_active)
        VALUES
            (:id, :title, :description, :source, :severity, :category,
             :issued_at, :expires_at, :sha256_hash, :is_active)
        """,
        alerts,
    )
    conn.commit()
    conn.close()
    print(f"  ✓ Seeded {len(alerts)} civic alerts for Bhopal city")


# ═══════════════════════════════════════════════════════════════════
# Text matching / verification engine
# ═══════════════════════════════════════════════════════════════════

# Keywords mapped to categories for quick routing.
_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "flood": [
        "flood", "waterlogging", "water logging", "waterlog", "rain",
        "rainfall", "upper lake", "lower lake", "bada talab",
        "chhota talab", "bhadbhada", "overflow", "submerge",
        "hoshangabad road", "kaliasot", "inundation", "dam", "spillway",
    ],
    "traffic": [
        "traffic", "brts", "bus", "diversion", "road block", "karond",
        "jam", "congestion", "mp nagar", "route", "berasia",
    ],
    "health": [
        "dengue", "malaria", "contamination", "health", "hospital",
        "disease", "epidemic", "coliform", "boil water", "fogging",
        "fever", "mosquito", "shahpura", "water quality",
    ],
    "power": [
        "power", "electricity", "outage", "shutdown", "blackout",
        "load shedding", "transformer", "cable fault", "mppkvvcl",
        "power cut", "arera colony", "tt nagar",
    ],
    "road_closure": [
        "road closed", "road closure", "bridge", "overbridge",
        "new market", "roshanpura", "marathon", "structural audit",
    ],
    "weather": [
        "weather", "imd", "thunderstorm", "lightning", "hail",
        "storm", "wind", "orange alert", "red alert", "forecast",
        "meteorological",
    ],
    "hazard": [
        "gas leak", "chemical", "evacuate", "evacuation", "bhel",
        "chlorine", "fire", "explosion", "hazard", "toxic",
    ],
}

# Location keywords — boost score when the user's text mentions a
# location that also appears in an alert.
_LOCATION_KEYWORDS = [
    "hoshangabad", "habibganj", "misrod", "piplani", "kolar",
    "upper lake", "lower lake", "bhadbhada", "kaliasot",
    "mp nagar", "arera colony", "new market", "roshanpura",
    "tt nagar", "shyamla hills", "shahpura", "govindpura",
    "ayodhya nagar", "bagsewania", "karond", "lalghati",
    "jehangirabad", "bhel", "shivaji nagar", "db mall",
    "lal parade", "berasia", "sultania",
]


def _normalise(text: str) -> str:
    """Lower-case and strip extra whitespace."""
    return re.sub(r"\s+", " ", text.lower().strip())


def _extract_keywords(text: str) -> set[str]:
    """Pull out meaningful tokens (length ≥ 3) from text."""
    normalised = _normalise(text)
    tokens = set(re.findall(r"[a-z]{3,}", normalised))
    # Also match multi-word location phrases.
    for loc in _LOCATION_KEYWORDS:
        if loc in normalised:
            tokens.add(loc)
    return tokens


def _fuzzy_ratio(a: str, b: str) -> float:
    """Return SequenceMatcher ratio between two strings (0.0–1.0)."""
    return SequenceMatcher(None, a, b).ratio()


def _score_alert(user_text: str, alert: dict) -> float:
    """
    Compute a 0–1 relevance score between user text and a stored alert.

    Scoring components
    ──────────────────
    1. Category keyword overlap     (0.30 weight)
    2. Title fuzzy similarity       (0.25 weight)
    3. Description keyword overlap  (0.25 weight)
    4. Location mention match       (0.20 weight)
    """
    user_norm = _normalise(user_text)
    user_kw = _extract_keywords(user_text)

    alert_title_norm = _normalise(alert["title"])
    alert_desc_norm = _normalise(alert["description"])
    alert_all = alert_title_norm + " " + alert_desc_norm

    # 1. Category keyword overlap ────────────────────────────────
    cat = alert["category"]
    cat_kws = set(_CATEGORY_KEYWORDS.get(cat, []))
    if cat_kws:
        overlap = len(user_kw & cat_kws)
        cat_score = min(overlap / max(len(cat_kws) * 0.25, 1), 1.0)
    else:
        cat_score = 0.0

    # 2. Title fuzzy similarity ──────────────────────────────────
    title_score = _fuzzy_ratio(user_norm, alert_title_norm)

    # 3. Description keyword overlap ─────────────────────────────
    desc_kw = set(re.findall(r"[a-z]{3,}", alert_desc_norm))
    if desc_kw:
        desc_overlap = len(user_kw & desc_kw)
        desc_score = min(desc_overlap / max(len(desc_kw) * 0.15, 1), 1.0)
    else:
        desc_score = 0.0

    # 4. Location match ──────────────────────────────────────────
    loc_hits = sum(1 for loc in _LOCATION_KEYWORDS if loc in user_norm and loc in alert_all)
    loc_score = min(loc_hits / 2.0, 1.0)

    # Weighted total
    total = (
        0.30 * cat_score
        + 0.25 * title_score
        + 0.25 * desc_score
        + 0.20 * loc_score
    )
    return round(min(total, 1.0), 4)


def _confidence_label(score: float) -> str:
    if score >= 0.45:
        return "high"
    if score >= 0.25:
        return "medium"
    if score >= 0.10:
        return "low"
    return "none"


# ═══════════════════════════════════════════════════════════════════
# API Routes
# ═══════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    """Health-check / welcome endpoint."""
    return jsonify({
        "service": "Anti-Hoax Civic Alert Gateway",
        "version": "1.0.0",
        "status": "running",
        "endpoints": [
            "GET  /api/alerts",
            "GET  /api/alerts/<id>",
            "POST /api/verify",
            "GET  /api/stats",
            "GET  /api/sources",
        ],
    })


# ── GET /api/alerts ────────────────────────────────────────────────

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    """
    Return active alerts with optional filters.

    Query params
    ────────────
    category : str   — filter by category (e.g. flood, traffic)
    severity : str   — filter by severity (critical, warning, info)
    source   : str   — partial match on source name
    search   : str   — free-text search across title & description
    active   : 0|1   — override active filter (default 1)
    """
    db = get_db()

    clauses = []
    params: list = []

    # Active filter (default: only active)
    is_active = request.args.get("active", "1")
    if is_active in ("0", "1"):
        clauses.append("is_active = ?")
        params.append(int(is_active))

    category = request.args.get("category")
    if category:
        clauses.append("category = ?")
        params.append(category.lower())

    severity = request.args.get("severity")
    if severity:
        clauses.append("severity = ?")
        params.append(severity.lower())

    source = request.args.get("source")
    if source:
        clauses.append("source LIKE ?")
        params.append(f"%{source}%")

    search = request.args.get("search")
    if search:
        clauses.append("(title LIKE ? OR description LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    where = " AND ".join(clauses) if clauses else "1=1"
    query = f"SELECT * FROM alerts WHERE {where} ORDER BY issued_at DESC"

    rows = db.execute(query, params).fetchall()
    alerts = [row_to_dict(r) for r in rows]
    return jsonify({"count": len(alerts), "alerts": alerts})


# ── GET /api/alerts/<id> ───────────────────────────────────────────

@app.route("/api/alerts/<alert_id>", methods=["GET"])
def get_alert(alert_id: str):
    """Return a single alert with its full cryptographic proof."""
    db = get_db()
    row = db.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()

    if row is None:
        return jsonify({"error": "Alert not found"}), 404

    alert = row_to_dict(row)
    proof = generate_verification_proof(alert)
    return jsonify({"alert": alert, "cryptographic_proof": proof})


# ── POST /api/verify ───────────────────────────────────────────────

@app.route("/api/verify", methods=["POST"])
def verify_message():
    """
    Accept free-text and match against stored alerts.

    Request body (JSON):
        {"text": "Is there really flooding on Hoshangabad Road?"}

    Returns matched alerts ranked by relevance with confidence scores.
    """
    global _verified_queries_count

    data = request.get_json(silent=True)
    if not data or not isinstance(data.get("text"), str) or not data["text"].strip():
        return jsonify({"error": "Request body must include a non-empty 'text' field."}), 400

    user_text = data["text"].strip()
    _verified_queries_count += 1

    db = get_db()
    rows = db.execute("SELECT * FROM alerts WHERE is_active = 1").fetchall()
    alerts = [row_to_dict(r) for r in rows]

    scored: list[dict] = []
    for alert in alerts:
        score = _score_alert(user_text, alert)
        if score >= 0.05:
            scored.append({
                "alert": alert,
                "relevance_score": score,
                "confidence": _confidence_label(score),
            })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    top_matches = scored[:5]

    # Overall verdict
    if top_matches and top_matches[0]["relevance_score"] >= 0.45:
        verdict = "verified"
        verdict_detail = (
            "This message closely matches an officially issued civic alert. "
            "Refer to the matched alert(s) below for accurate information."
        )
    elif top_matches and top_matches[0]["relevance_score"] >= 0.25:
        verdict = "partially_verified"
        verdict_detail = (
            "This message partially matches one or more civic alerts. "
            "Details may be inaccurate or exaggerated — please cross-check."
        )
    elif top_matches and top_matches[0]["relevance_score"] >= 0.10:
        verdict = "unverified"
        verdict_detail = (
            "Only a weak connection to existing alerts was found. "
            "This information is likely unverified rumour."
        )
    else:
        verdict = "no_match"
        verdict_detail = (
            "No matching civic alert found in our database. "
            "This could be a hoax or misinformation. Please rely on official sources."
        )

    return jsonify({
        "query": user_text,
        "verdict": verdict,
        "verdict_detail": verdict_detail,
        "matches_found": len(top_matches),
        "matches": top_matches,
        "verified_at": _iso(_now()),
    })


# ── GET /api/stats ─────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Dashboard statistics."""
    db = get_db()

    total = db.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    active = db.execute("SELECT COUNT(*) FROM alerts WHERE is_active = 1").fetchone()[0]

    by_category = {}
    for row in db.execute(
        "SELECT category, COUNT(*) as cnt FROM alerts GROUP BY category"
    ).fetchall():
        by_category[row["category"]] = row["cnt"]

    by_severity = {}
    for row in db.execute(
        "SELECT severity, COUNT(*) as cnt FROM alerts GROUP BY severity"
    ).fetchall():
        by_severity[row["severity"]] = row["cnt"]

    by_source = {}
    for row in db.execute(
        "SELECT source, COUNT(*) as cnt FROM alerts GROUP BY source"
    ).fetchall():
        by_source[row["source"]] = row["cnt"]

    return jsonify({
        "total_alerts": total,
        "active_alerts": active,
        "verified_queries": _verified_queries_count,
        "alerts_by_category": by_category,
        "alerts_by_severity": by_severity,
        "alerts_by_source": by_source,
    })


# ── GET /api/sources ───────────────────────────────────────────────

@app.route("/api/sources", methods=["GET"])
def get_sources():
    """Return the list of verified / trusted alert sources."""
    sources = [
        {
            "name": "Bhopal Municipal Corporation",
            "short": "BMC",
            "type": "Government",
            "categories": ["flood", "power", "road_closure", "hazard"],
            "verified": True,
            "website": "https://www.bhopal.nic.in",
        },
        {
            "name": "Bhopal City Police",
            "short": "BCP",
            "type": "Law Enforcement",
            "categories": ["traffic", "road_closure"],
            "verified": True,
            "website": "https://www.bhopolpolice.gov.in",
        },
        {
            "name": "India Meteorological Department",
            "short": "IMD",
            "type": "Government",
            "categories": ["weather"],
            "verified": True,
            "website": "https://mausam.imd.gov.in",
        },
        {
            "name": "Bhopal Health Department",
            "short": "BHD",
            "type": "Government",
            "categories": ["health"],
            "verified": True,
            "website": "https://www.health.mp.gov.in",
        },
    ]
    return jsonify({"count": len(sources), "sources": sources})


# ═══════════════════════════════════════════════════════════════════
# Error handlers
# ═══════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(_e):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def internal_error(_e):
    return jsonify({"error": "Internal server error"}), 500


# ═══════════════════════════════════════════════════════════════════
# Startup
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print()
    print("=" * 60)
    print("  Anti-Hoax Civic Alert Gateway — Backend")
    print("=" * 60)
    print()
    print("  Initialising database …")
    init_db()
    seed_alerts()
    print()
    print("  🚀  Server starting on:  http://localhost:5000")
    print("  📡  API base URL:        http://localhost:5000/api")
    print()
    print("  Endpoints:")
    print("    GET  /api/alerts        — List alerts (filterable)")
    print("    GET  /api/alerts/<id>   — Single alert + crypto proof")
    print("    POST /api/verify        — Verify a rumour / message")
    print("    GET  /api/stats         — Dashboard statistics")
    print("    GET  /api/sources       — Trusted source list")
    print()
    print("=" * 60)
    print()

    app.run(host="0.0.0.0", port=5000, debug=True)

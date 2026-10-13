#!/usr/bin/env python3
"""
setup_db.py — NexusOps Enterprise Database Seeder
Idempotently creates and seeds both SQLite databases.
Run: python setup_db.py
"""
import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def setup_enterprise_db():
    """Create and seed the enterprise_mock.db with service data."""
    db_path = os.path.join(BASE_DIR, "enterprise_mock.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_health (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL,
            latency_ms INTEGER NOT NULL,
            error_rate REAL NOT NULL
        )
    """)
    cursor.executemany(
        "INSERT OR IGNORE INTO service_health (service, status, latency_ms, error_rate) VALUES (?, ?, ?, ?)",
        [
            ("Payment API",   "Down",        5000, 98.5),
            ("Auth Service",  "Degraded",    1200, 35.2),
            ("Web Frontend",  "Operational", 85,   0.1),
        ]
    )

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL
        )
    """)
    cursor.executemany(
        "INSERT OR IGNORE INTO service_logs (id, service, timestamp, level, message) VALUES (?, ?, ?, ?, ?)",
        [
            (1, "Payment API", "2026-10-11 10:01:00", "ERROR", "500 Internal Server Error — DB connection pool exhausted"),
            (2, "Payment API", "2026-10-11 10:02:00", "ERROR", "Timeout connecting to payments-db.internal:5432"),
            (3, "Auth Service", "2026-10-11 10:03:00", "WARN",  "High JWT validation failure rate: 35%"),
            (4, "Web Frontend", "2026-10-11 10:04:00", "INFO",  "Service healthy — all health checks passing"),
        ]
    )

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS historical_incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT UNIQUE NOT NULL,
            service TEXT NOT NULL,
            description TEXT NOT NULL,
            resolution TEXT NOT NULL
        )
    """)
    cursor.executemany(
        "INSERT OR IGNORE INTO historical_incidents (incident_id, service, description, resolution) VALUES (?, ?, ?, ?)",
        [
            ("INC-001", "Payment API",
             "Payment failures due to database connection timeout.",
             "Increased DB connection pool size from 20 to 100. Restarted Payment API pods. Added circuit breaker."),
            ("INC-002", "Auth Service",
             "High authentication failure rate due to expired SSL certificates.",
             "Renewed SSL/TLS certificates. Deployed updated secrets. Authentication failure rate returned to <1%."),
        ]
    )

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_runbooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            step_description TEXT NOT NULL,
            UNIQUE(service, step_number)
        )
    """)
    cursor.executemany(
        "INSERT OR IGNORE INTO service_runbooks (service, step_number, step_description) VALUES (?, ?, ?)",
        [
            ("Payment API", 1, "1. Check database connection: `psql -h payments-db.internal -U app_user`"),
            ("Payment API", 2, "2. Verify DB connection pool: `SHOW max_connections;` (should be >= 100)"),
            ("Payment API", 3, "3. Restart pods if needed: `kubectl rollout restart deploy/payment-api -n production`"),
            ("Auth Service", 1, "1. Check SSL certificate expiry: `openssl s_client -connect auth.internal:443 | openssl x509 -noout -dates`"),
            ("Auth Service", 2, "2. Renew certificate: `certbot renew --cert-name auth.internal`"),
        ]
    )

    conn.commit()
    conn.close()
    print(f"✅  enterprise_mock.db seeded at: {db_path}")


def setup_memory_db():
    """Create the agentsync_memory.db workflow history table."""
    db_path = os.path.join(BASE_DIR, "agentsync_memory.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workflow_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_request TEXT,
            plan TEXT,
            research_results TEXT,
            analysis TEXT,
            decision TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    print(f"✅  agentsync_memory.db initialized at: {db_path}")


if __name__ == "__main__":
    print("🔧  Setting up NexusOps databases...")
    setup_enterprise_db()
    setup_memory_db()
    print("\n🚀  Database setup complete. You can now start the API server:")
    print("    uvicorn api.main:app --reload --host 0.0.0.0 --port 8000")

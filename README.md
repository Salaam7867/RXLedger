# KMH ERP — Multi-Agent Pharmacy Invoice OCR & Inventory Automation

> **Note on Intellectual Property:** This system is actively deployed in production for a retail pharmacy. To protect commercial data and proprietary domain prompts, distributor records, API configurations, and full production prompts are redacted. Core validation and entity-resolution modules are included in `/src` for technical review.

## Business Impact (Live Production)
* **Loss Prevention:** Automatically tracks batch expiry dates; flagged **25 near-expiry inbound items (≤6 months shelf life)** in 30 days, preventing **₹7,924 in MRP losses** (₹5,618 purchase cost).
* **Operational Efficiency:** Cut daily manual invoice auditing time by **25% (~15 hours/month saved)**.
* **Cash-Flow Control:** Real-time mobile stock lookups on the shop floor eliminated duplicate distributor orders.

## System Architecture

```mermaid
flowchart TD
    A[Mobile AppSheet Upload] --> B[Google Drive Inbox]
    B --> C[Apps Script Trigger + LockService]
    C --> D[Step 1: Gemini Vision OCR + CacheService]
    D --> E{MIME-Type Router}
    E -->|Image| F[Step 2: Groq Qwen Vision Auditor]
    E -->|PDF / Fallback| G[Step 2B: Gemini 2.5 Flash Auditor]
    F --> H[Deterministic JS Guardrails]
    G --> H
    H -->|Levenshtein + MRP Kill-Switch + 3-Item Deduplication| I[Google Sheets Ledger]
    I --> J[AppSheet Mobile UI + 1-Click HITL Revert]
    I --> K[Automated Email Audit Report]

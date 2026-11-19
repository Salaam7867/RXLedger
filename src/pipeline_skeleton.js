/**
 * KMH ERP — Serverless Orchestration Skeleton (Sanitized for Portfolio Review)
 * Proprietary OCR prompts, distributor GSTIN tables, and Workspace IDs are redacted.
 */

const CONFIG = {
  MAX_EXECUTION_SECONDS: 360,     // Google Apps Script hard limit
  SAFETY_BREAKER_BUFFER: 140,     // Exit cleanly with 140s remaining
  STEP1_CACHE_TTL_SECONDS: 21600, // 6-hour CacheService TTL for retry resilience
  INVOICE_FOLDER_ID: "<REDACTED_DRIVE_FOLDER_ID>",
  ALERT_RECIPIENT: "<REDACTED_EMAIL>"
};

function processPendingInvoices() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return; // Prevent overlapping trigger runs

  const scriptStartTime = Date.now();
  const cache = CacheService.getScriptCache();

  try {
    const files = DriveApp.getFolderById(CONFIG.INVOICE_FOLDER_ID).getFiles();

    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") continue;

      // Step 1: Primary Vision OCR (with 6-hour CacheService memoization)
      const fileId = file.getId();
      let step1Output = cache.get(fileId) ? JSON.parse(cache.get(fileId)) : null;

      if (!step1Output) {
        step1Output = extractInvoiceWithPrimaryVision(file); // Uses proprietary MASTER_OCR_PROMPT
        if (step1Output) cache.put(fileId, JSON.stringify(step1Output), CONFIG.STEP1_CACHE_TTL_SECONDS);
      }
      if (!step1Output) continue;

      // Step 2: MIME-Type Smart Router -> Secondary Vision Auditor + Deterministic Guardrails
      const verified = (mimeType === "application/pdf")
        ? verifyWithPdfCapableFallback(file, step1Output)
        : verifyWithGroqVision(file, step1Output);

      // Step 3: 3-Item Deep Deduplication + Entity Resolution -> Append to Ledger
      // (Distributor GSTIN resolution & Google Sheets write logic redacted)
      if (verified && verified.isValid) {
        appendVerifiedItemsToLedger(verified.data);
        cache.remove(fileId);
      }

      // Execution Safety Breaker: stop cleanly before 6-minute hard timeout
      const elapsed = Math.floor((Date.now() - scriptStartTime) / 1000);
      if (CONFIG.MAX_EXECUTION_SECONDS - elapsed < CONFIG.SAFETY_BREAKER_BUFFER) {
        break;
      }
    }
  } finally {
    // Dispatch structured email audit report & release concurrency lock
    sendAuditSummaryEmail(CONFIG.ALERT_RECIPIENT);
    lock.releaseLock();
  }
}

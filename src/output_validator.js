/**
 * Deterministic LLM Output Validator
 * Audits Step-2 Vision Auditor JSON against Step-1 Extractor output.
 * Enforces structural parity, locks verified names, restores truncated decimals,
 * and rejects malformed numeric fields before any database write.
 */

function validateAuditorOutput(primaryData, auditedData) {
  function normalizeInvoices(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.invoices)) return data.invoices;
    if (data && Array.isArray(data.items)) return [data];
    return null;
  }

  const primaryInvoices = normalizeInvoices(primaryData);
  const auditedInvoices = normalizeInvoices(auditedData);

  if (!primaryInvoices || !auditedInvoices || auditedInvoices.length === 0) {
    return { isValid: false, reason: "Invalid or empty invoice structure" };
  }

  if (primaryInvoices.length !== auditedInvoices.length) {
    return {
      isValid: false,
      reason: `Invoice count mismatch: Primary=${primaryInvoices.length}, Auditor=${auditedInvoices.length}`
    };
  }

  let totalItems = 0;

  for (let i = 0; i < primaryInvoices.length; i++) {
    const originalItems = primaryInvoices[i] && primaryInvoices[i].items;
    const correctedItems = auditedInvoices[i] && auditedInvoices[i].items;

    if (!Array.isArray(originalItems) || !Array.isArray(correctedItems)) {
      return { isValid: false, reason: `Invalid items array in invoice ${i + 1}` };
    }

    if (originalItems.length !== correctedItems.length) {
      return {
        isValid: false,
        reason: `Line count mismatch in invoice ${i + 1}: Primary=${originalItems.length}, Auditor=${correctedItems.length}`
      };
    }

    totalItems += correctedItems.length;

    for (let j = 0; j < correctedItems.length; j++) {
      const item = correctedItems[j];
      if (!item || typeof item !== "object") {
        return { isValid: false, reason: `Invalid item at invoice ${i + 1}, row ${j + 1}` };
      }

      // Lock normalized medicine_name to Step-1 extractor
      if (originalItems[j] && originalItems[j].medicine_name) {
        item.medicine_name = String(originalItems[j].medicine_name).trim();
      }

      const name = String(item.medicine_name || "").trim();
      let qty = Number(item.qty);
      let freeQty = Number(item.free_qty == null || item.free_qty === "" ? 0 : item.free_qty);

      // Decimal Quantity Guardrail: restore fractional strips (e.g., 5.5) if auditor truncated to integer
      if (originalItems[j]) {
        const origQty = Number(originalItems[j].qty);
        if (origQty % 1 !== 0 && Math.floor(origQty) === qty) {
          qty = origQty;
        }
        const origFree = Number(originalItems[j].free_qty);
        if (origFree % 1 !== 0 && Math.floor(origFree) === freeQty) {
          freeQty = origFree;
        }
      }

      const mrp = Number(item.mrp);
      const rate = Number(item.rate);
      const packing = Number(item.packing);

      if (name.length < 2) {
        return { isValid: false, reason: `Missing medicine name at invoice ${i + 1}, row ${j + 1}` };
      }
      if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(freeQty) || freeQty < 0 || qty + freeQty <= 0) {
        return { isValid: false, reason: `Invalid quantity for ${name}` };
      }
      if (!Number.isFinite(mrp) || mrp < 0 || !Number.isFinite(rate) || rate < 0) {
        return { isValid: false, reason: `Invalid MRP or rate for ${name}` };
      }
      if (!Number.isFinite(packing) || packing <= 0) {
        return { isValid: false, reason: `Invalid packing for ${name}` };
      }

      item.medicine_name = name;
      item.qty = qty;
      item.free_qty = freeQty;
      item.mrp = mrp;
      item.rate = rate;
      item.packing = packing;
    }
  }

  return {
    isValid: true,
    normalizedData: auditedInvoices,
    summary: `Invoices: ${auditedInvoices.length}, line items: ${totalItems}`
  };
}

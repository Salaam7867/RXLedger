/**
 * RXLedger — Deterministic Entity Resolution & Fuzzy Matching Module
 * Prevents duplicate SKU fragmentation across inconsistent distributor bills
 * using Levenshtein distance, Jaccard token overlap, an MRP kill-switch,
 * and dosage-form conflict blockers.
 */

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findClosestMedicineMatch(newName, newMrp, masterNamesSet, mrpMap) {
  const cleanNew = String(newName || "").trim().toUpperCase();
  let bestMatch = cleanNew;
  let highestScore = 0;

  const newTokens = cleanNew.split(/\s+/);
  if (newTokens.length === 0) return cleanNew;

  masterNamesSet.forEach(existingName => {
    // Exact match always wins
    if (cleanNew === existingName) {
      highestScore = 2.0;
      bestMatch = existingName;
      return;
    }

    // Strict MRP Kill-Switch: reject any fuzzy candidate with a mismatched MRP
    const existingMrps = mrpMap.get(existingName) || new Set();
    const mrpMatches = existingMrps.has(Number(newMrp));
    if (!mrpMatches) return;

    const existingTokens = existingName.split(/\s+/);

    // 1. Jaccard similarity (token overlap)
    const intersection = newTokens.filter(token => existingTokens.includes(token));
    const union = new Set([...newTokens, ...existingTokens]);
    let score = intersection.length / union.size;

    // 2. Dosage-form conflict blocker (e.g., block TAB <-> SYP, allow TAB <-> CAP)
    const dosageForms = ["TAB", "CAP", "SYP", "INJ", "OINT", "CREAM", "DROP", "E/D"];
    const newDosage = newTokens.find(t => dosageForms.includes(t));
    const existingDosage = existingTokens.find(t => dosageForms.includes(t));

    let hasDosageConflict = false;
    if (newDosage && existingDosage && newDosage !== existingDosage) {
      const isSolidOralMismatch =
        ["TAB", "CAP"].includes(newDosage) && ["TAB", "CAP"].includes(existingDosage);
      if (!isSolidOralMismatch) {
        hasDosageConflict = true;
      }
    }

    // 3. Brand typo tolerance + MRP rule
    const brandNew = newTokens[0];
    const brandExisting = existingTokens[0];
    const typoDistance = getLevenshteinDistance(brandNew, brandExisting);
    const maxBrandLen = Math.max(brandNew.length, brandExisting.length);
    const brandSimilarity = (maxBrandLen - typoDistance) / maxBrandLen;

    if (brandSimilarity >= 0.80 && mrpMatches && !hasDosageConflict) {
      score = Math.max(score, 0.85);
    }

    if (score >= 0.65 && mrpMatches) {
      score += 0.2;
    }

    if (score > highestScore && score >= 0.75) {
      highestScore = score;
      bestMatch = existingName;
    }
  });

  return highestScore >= 0.75 ? bestMatch : cleanNew;
}

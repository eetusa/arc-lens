// A map of characters that look similar.
// If we substitute one for another, the cost is low.
const HOMOGLYPHS = {
    'z': ['2'],
    '2': ['z'],
    's': ['5'],
    '5': ['s'],
    'b': ['8'],
    '8': ['b'],
    'g': ['6'],
    '6': ['g'],
    'o': ['0', 'q', 'd'],
    '0': ['o', 'q', 'd'],
    // i/l/1 confusion is common in OCR, especially for Roman numerals
    'i': ['l', '1'],
    'l': ['i', '1'],
    '1': ['i', 'l'],
};

/**
 * Returns the cost of substituting char A for char B.
 * - Same char: 0
 * - Visual match: 0.1 (Very cheap!)
 * - Total mismatch: 1.0
 */
function getSubstitutionCost(a, b) {
    if (a === b) return 0;
    
    // Check if 'a' is a known lookalike of 'b'
    if (HOMOGLYPHS[a] && HOMOGLYPHS[a].includes(b)) {
        return 0.1; // Visual Match Priority
    }
    
    return 1; // Standard Penalty
}


/**
 * Calculates Levenshtein distance between two strings.
 */
function weightedLevenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // Initialize first column and row
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            
            // Calculate cost for substitution using our lookalike logic
            const subCost = getSubstitutionCost(b.charAt(i - 1), a.charAt(j - 1));
            
            matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + subCost, // Substitution (Weighted)
                Math.min(
                    matrix[i][j - 1] + 1,       // Insertion (Always 1)
                    matrix[i - 1][j] + 1        // Deletion (Always 1)
                )
            );
        }
    }
    return matrix[b.length][a.length];
}

function normalizeUser(text) {
    if (!text) return "";

    var normalized = text.toLowerCase()
        .replace(/ /g, "")      // Remove spaces
        .replace(/\n/g, "")     // Remove newlines
        .replace(/\r/g, "")     // Remove carriage returns
        .replace(/\|/g, "i")    // Fix pipes
        .replace(/[.,:;]/g, ""); // <--- NEW: Remove dots, commas, colons, semi-colons
    return normalized;
}

export function findBestMatch(ocrText, candidates) {
    if (!ocrText || !candidates || candidates.length === 0) return null;

    const cleanOcr = normalizeUser(ocrText);
    
    // Configuration
    const PREFIX_PENALTY = 0.25; // Small penalty to break ties in favor of whole words
    const MAX_COST_PER_CHAR = 0.4; // How sloppy can we be? (0.4 allows ~1 error per 2.5 chars)
    
    let bestCandidate = null;
    let minScore = Infinity;

    for (const refName of candidates) {
        const cleanRef = normalizeUser(refName);
        if (!cleanRef) continue;

        // ---------------------------------------------------------
        // 1. Calculate Whole Match Score
        //    (e.g. OCR: "word1word2x", Cand: "word1word2")
        // ---------------------------------------------------------
        const distWhole = weightedLevenshtein(cleanOcr, cleanRef);
        
        // ---------------------------------------------------------
        // 2. Calculate Prefix Score
        //    (e.g. OCR: "word1word2", Cand: "word1word2word3")
        // ---------------------------------------------------------
        let distPrefix = Infinity;
        
        // We only check prefix if the candidate is actually longer than the OCR
        if (cleanRef.length > cleanOcr.length) {
            // Cut the candidate to the same length as OCR to compare apples to apples
            const refPrefix = cleanRef.substring(0, cleanOcr.length);
            
            // Calculate distance, then ADD the penalty.
            // This ensures "Word1 Word2" (Exact match) beats "Word1 Word2 Extra" (Prefix match)
            distPrefix = weightedLevenshtein(cleanOcr, refPrefix) + PREFIX_PENALTY;
        }

        // ---------------------------------------------------------
        // 3. Determine the winning score for this specific candidate
        // ---------------------------------------------------------
        
        // We take the better (lower) of the two approaches
        const localScore = Math.min(distWhole, distPrefix);

        // Calculate a threshold based on length so short words don't allow too many errors
        const allowedCost = cleanOcr.length * MAX_COST_PER_CHAR;

        // If this candidate is the best we've seen so far, and fits within error limits
        if (localScore < minScore && localScore <= allowedCost) {
            minScore = localScore;
            bestCandidate = refName;
        }
    }

    return bestCandidate;
}
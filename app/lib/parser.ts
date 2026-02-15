export interface LoanRecord {
  reportingDate: Date;
  accountId: string;
  ccy: string;
  outstanding: number;
  interestRate: number; // stored as decimal, e.g. 0.09 for 9%
  startDate: Date;
  endDate: Date;
  installment: string; // "Yes" or "No"
  productType: string;
  segment: string;
  daerah: string;
  kodePos: string;
  insuredUninsured: string;
  transactional: string;
}

function parseDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  // Support DD/MM/YYYY and DD-MM-YYYY
  const parts = trimmed.split(/[\/\-]/);
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: "${trimmed}". Expected DD/MM/YYYY`);
  }
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

function parseNumber(numStr: string): number {
  // Remove quotes, thousands separators (both . and ,)
  let trimmed = numStr.trim().replace(/"/g, "");

  // If number uses period as thousands separator and comma as decimal (e.g. 1.000.000,50)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) {
    trimmed = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard: remove commas as thousands separators
    trimmed = trimmed.replace(/,/g, "");
  }

  const val = parseFloat(trimmed);
  if (isNaN(val)) {
    throw new Error(`Invalid number: "${numStr}"`);
  }
  return val;
}

/**
 * Parse a single CSV/TSV line respecting quoted fields.
 * Handles: "Jawa Barat", "Jakarta Selatan", fields with commas inside quotes, etc.
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === delimiter || (delimiter === "\t" && char === "\t")) {
        fields.push(current.trim());
        current = "";
        i++;
        continue;
      }
      current += char;
      i++;
    }
  }
  // Push last field
  fields.push(current.trim());
  return fields;
}

/**
 * Auto-detect delimiter by analyzing the header row.
 * Prioritizes: tab > semicolon > comma (since commas can appear inside numbers).
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0];

  // Count delimiters OUTSIDE of quoted fields
  let tabCount = 0;
  let semiCount = 0;
  let commaCount = 0;
  let inQuotes = false;

  for (const char of firstLine) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes) {
      if (char === "\t") tabCount++;
      else if (char === ";") semiCount++;
      else if (char === ",") commaCount++;
    }
  }

  // Need at least 13 delimiters for 14 columns
  if (tabCount >= 13) return "\t";
  if (semiCount >= 13) return ";";
  if (commaCount >= 13) return ",";

  // Fall back to highest count
  if (tabCount >= semiCount && tabCount >= commaCount) return "\t";
  if (semiCount >= commaCount) return ";";
  return ",";
}

export function parseTxtFile(text: string): LoanRecord[] {
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error(
      "File must contain a header row and at least one data row.",
    );
  }

  const delimiter = detectDelimiter(text);
  const records: LoanRecord[] = [];

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);

    if (cols.length < 14) {
      throw new Error(
        `Row ${i + 1} has only ${cols.length} columns, expected 14. Check your delimiter and quoting.`,
      );
    }

    try {
      const record: LoanRecord = {
        reportingDate: parseDate(cols[0]),
        accountId: cols[1],
        ccy: cols[2],
        outstanding: parseNumber(cols[3]),
        interestRate: parseNumber(cols[4]) / 100, // Convert percentage to decimal
        startDate: parseDate(cols[5]),
        endDate: parseDate(cols[6]),
        installment: cols[7],
        productType: cols[8],
        segment: cols[9],
        daerah: cols[10],
        kodePos: cols[11],
        insuredUninsured: cols[12],
        transactional: cols[13],
      };
      records.push(record);
    } catch (err) {
      throw new Error(`Error parsing row ${i + 1}: ${(err as Error).message}`);
    }
  }

  return records;
}

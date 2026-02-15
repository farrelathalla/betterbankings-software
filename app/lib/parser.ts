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
  const trimmed = numStr.trim().replace(/,/g, "");
  const val = parseFloat(trimmed);
  if (isNaN(val)) {
    throw new Error(`Invalid number: "${numStr}"`);
  }
  return val;
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0];
  // Count potential delimiters
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  if (tabCount >= semiCount && tabCount >= commaCount) return "\t";
  if (semiCount >= commaCount) return ";";
  return ",";
}

export function parseTxtFile(text: string): LoanRecord[] {
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error(
      "File must contain a header row and at least one data row.",
    );
  }

  const delimiter = detectDelimiter(text);
  const records: LoanRecord[] = [];

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());

    if (cols.length < 14) {
      throw new Error(
        `Row ${i + 1} has only ${cols.length} columns, expected 14.`,
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

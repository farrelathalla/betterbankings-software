import { LoanRecord } from "./parser";

/**
 * Cashflow engine — ported from Python calculator.py
 *
 * Supports:
 *   installment=no  → bullet (interest each period, principal at maturity)
 *   installment=yes → annuity (PMT) or flat (equal principal + fixed interest)
 *
 * Bucket calculations use the "flat" variants from calculator.py with special rules:
 *   LCR interest: interest only counted for ≤30D bucket (>30D = 0)
 *   NSFR interest: always 0
 */

// ─── Time-bucket labels (IRRBB) ──────────────────────────────
export const IRRBB_LABELS = [
  "≤ 1 bulan",
  "1-3 bulan",
  "3-6 bulan",
  "6-9 bulan",
  "9-12 bulan",
  "1-1.5Y",
  "1.5-2Y",
  "2-3Y",
  "3-4Y",
  "4-5Y",
  "5-6Y",
  "6-7Y",
  "7-8Y",
  "8-9Y",
  "9-10Y",
  "10-15Y",
  "15-20Y",
  "> 20Y",
];

const IRRBB_MONTH_EDGES = [
  1,
  3,
  6,
  9,
  12,
  18,
  24,
  36,
  48,
  60,
  72,
  84,
  96,
  108,
  120,
  180,
  240,
  Infinity,
];

export const LCR_LABELS = ["CF ≤30D", "CF >30D"];
export const NSFR_LABELS = ["CF <6M", "CF 6-12M", "CF >12M"];

// ─── Schedule types ──────────────────────────────────────────
interface ScheduleRow {
  period: number;
  paymentDate: Date;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

// ─── Result interface (shared for BBI / Interest / Both) ─────
export interface CashflowRow {
  // Input passthrough
  reportingDate: Date;
  accountId: string;
  ccy: string;
  outstanding: number;
  interestRate: number;
  startDate: Date;
  endDate: Date;
  installment: string;
  productType: string;
  segment: string;
  daerah: string;
  kodePos: string;
  insuredUninsured: string;
  transactional: string;
  // Computed
  remainingDays: number;
  lcrBuckets: number[]; // [≤30D, >30D]
  nsfrBuckets: number[]; // [<6M, 6-12M, >12M]
  irrbbBuckets: number[]; // 18 IRRBB buckets
}

// ─── PMT formula (equivalent to numpy_financial.pmt) ─────────
function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return -pv / nper;
  const factor = Math.pow(1 + rate, nper);
  return (-pv * rate * factor) / (factor - 1);
}

// ─── Helpers ─────────────────────────────────────────────────
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthDiff(a: Date, b: Date): number {
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  );
}

function dayDiff(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

// ─── Generate payment dates (matches Python) ─────────────────
function generatePaymentDates(reportingDate: Date, endDate: Date): Date[] {
  const anchorDay = endDate.getDate();

  let year = reportingDate.getFullYear();
  let month = reportingDate.getMonth() + 1; // 1-indexed

  // Move to next month if reporting day >= anchor day
  if (reportingDate.getDate() >= anchorDay) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  const dates: Date[] = [];

  while (true) {
    const lastDay = daysInMonth(year, month);
    const day = Math.min(anchorDay, lastDay);
    const d = new Date(year, month - 1, day);

    if (d > endDate) break;
    dates.push(d);

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return dates;
}

// ─── Build amortization schedule ─────────────────────────────
function buildSchedule(
  loan: LoanRecord,
  method: "annuity" | "flat",
): ScheduleRow[] {
  const principal = loan.outstanding;
  const annualRate = loan.interestRate;
  const installment = loan.installment.toLowerCase();
  const r = annualRate / 12;

  const reportingDate = loan.reportingDate;
  const endDate = loan.endDate;

  if (endDate <= reportingDate) return [];

  const paymentDates = generatePaymentDates(reportingDate, endDate);
  const periods = paymentDates.length;

  if (periods === 0) return [];

  const rows: ScheduleRow[] = [];
  let balance = principal;

  // ── INSTALLMENT = NO (Bullet) ──
  if (installment === "no") {
    const monthlyInterest = principal * r;
    for (let i = 0; i < periods; i++) {
      const principalPayment = i === periods - 1 ? principal : 0;
      const interest = monthlyInterest;
      const payment = principalPayment + interest;
      balance -= principalPayment;
      rows.push({
        period: i + 1,
        paymentDate: paymentDates[i],
        payment: round2(payment),
        principal: round2(principalPayment),
        interest: round2(interest),
        remainingBalance: round2(Math.max(balance, 0)),
      });
    }
    return rows;
  }

  // ── INSTALLMENT = YES ──
  if (installment === "yes") {
    if (method === "annuity") {
      const pmtVal =
        r !== 0 ? pmt(r, periods, -principal) : principal / periods;
      for (let i = 0; i < periods; i++) {
        const interest = balance * r;
        const principalPayment = pmtVal - interest;
        balance -= principalPayment;
        rows.push({
          period: i + 1,
          paymentDate: paymentDates[i],
          payment: round2(pmtVal),
          principal: round2(principalPayment),
          interest: round2(interest),
          remainingBalance: round2(Math.max(balance, 0)),
        });
      }
    } else {
      // flat
      const monthlyPrincipal = principal / periods;
      const monthlyInterest = principal * r;
      const payment = monthlyPrincipal + monthlyInterest;
      for (let i = 0; i < periods; i++) {
        balance -= monthlyPrincipal;
        rows.push({
          period: i + 1,
          paymentDate: paymentDates[i],
          payment: round2(payment),
          principal: round2(monthlyPrincipal),
          interest: round2(monthlyInterest),
          remainingBalance: round2(Math.max(balance, 0)),
        });
      }
    }
    return rows;
  }

  // Fallback: treat unknown installment as "no"
  return [];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Bucket: LCR flat ────────────────────────────────────────
function getBucketLCRFlat(
  schedule: ScheduleRow[],
  reportingDate: Date,
  valueType: "principal" | "interest",
): number[] {
  const result = [0, 0]; // [≤30D, >30D]
  if (!schedule.length) return result;

  for (const row of schedule) {
    const days = dayDiff(reportingDate, row.paymentDate);
    const bucketIdx = days <= 30 ? 0 : 1;

    if (valueType === "principal") {
      result[bucketIdx] += row.principal;
    } else {
      // Interest: only count ≤30D, >30D is 0
      if (bucketIdx === 0) {
        result[0] += row.interest;
      }
      // else: result[1] stays 0
    }
  }
  return result.map(round2);
}

// ─── Bucket: NSFR flat ───────────────────────────────────────
function getBucketNSFRFlat(
  schedule: ScheduleRow[],
  reportingDate: Date,
  valueType: "principal" | "interest",
): number[] {
  const result = [0, 0, 0]; // [<6M, 6-12M, >12M]
  if (!schedule.length) return result;

  for (const row of schedule) {
    const months = monthDiff(reportingDate, row.paymentDate);

    let bucketIdx: number;
    if (months < 6) bucketIdx = 0;
    else if (months <= 12) bucketIdx = 1;
    else bucketIdx = 2;

    if (valueType === "principal") {
      result[bucketIdx] += row.principal;
    } else {
      // Interest: always 0 for NSFR
      // result stays [0, 0, 0]
    }
  }
  return result.map(round2);
}

// ─── Bucket: IRRBB flat ─────────────────────────────────────
function getBucketIRRBBFlat(
  schedule: ScheduleRow[],
  reportingDate: Date,
  valueType: "principal" | "interest",
): number[] {
  const result = new Array(IRRBB_LABELS.length).fill(0);
  if (!schedule.length) return result;

  for (const row of schedule) {
    const days = dayDiff(reportingDate, row.paymentDate);
    const months = monthDiff(reportingDate, row.paymentDate);

    // Determine bucket index
    let bucketIdx: number;
    if (days <= 30) {
      bucketIdx = 0; // "≤ 1 bulan"
    } else {
      // Find bucket from MONTH_EDGES
      bucketIdx = -1;
      for (let i = 0; i < IRRBB_MONTH_EDGES.length - 1; i++) {
        if (
          months > IRRBB_MONTH_EDGES[i] &&
          months <= IRRBB_MONTH_EDGES[i + 1]
        ) {
          bucketIdx = i + 1; // +1 because index 0 is "≤ 1 bulan"
          break;
        }
      }
      // Edge: months <= 1 but days > 30 → "1-3 bulan"
      if (bucketIdx === -1) {
        if (months <= IRRBB_MONTH_EDGES[0]) {
          bucketIdx = 1; // "1-3 bulan"
        } else {
          bucketIdx = IRRBB_LABELS.length - 1; // "> 20Y"
        }
      }
    }

    const val = valueType === "principal" ? row.principal : row.interest;
    if (bucketIdx >= 0 && bucketIdx < result.length) {
      result[bucketIdx] += val;
    }
  }
  return result.map(round2);
}

// ─── Process a single record ─────────────────────────────────
function processOneRecord(
  record: LoanRecord,
  method: "annuity" | "flat",
  valueType: "principal" | "interest",
): CashflowRow {
  const schedule = buildSchedule(record, method);
  const remainingDays = dayDiff(record.reportingDate, record.endDate);

  const lcrBuckets = getBucketLCRFlat(
    schedule,
    record.reportingDate,
    valueType,
  );
  const nsfrBuckets = getBucketNSFRFlat(
    schedule,
    record.reportingDate,
    valueType,
  );
  const irrbbBuckets = getBucketIRRBBFlat(
    schedule,
    record.reportingDate,
    valueType,
  );

  return {
    reportingDate: record.reportingDate,
    accountId: record.accountId,
    ccy: record.ccy,
    outstanding: record.outstanding,
    interestRate: record.interestRate,
    startDate: record.startDate,
    endDate: record.endDate,
    installment: record.installment,
    productType: record.productType,
    segment: record.segment,
    daerah: record.daerah,
    kodePos: record.kodePos,
    insuredUninsured: record.insuredUninsured,
    transactional: record.transactional,
    remainingDays,
    lcrBuckets,
    nsfrBuckets,
    irrbbBuckets,
  };
}

// ─── Sum two cashflow rows (for "Both" mode) ─────────────────
function sumCashflowRows(a: CashflowRow, b: CashflowRow): CashflowRow {
  return {
    ...a, // passthrough fields from first (same record)
    lcrBuckets: a.lcrBuckets.map((v, i) => round2(v + b.lcrBuckets[i])),
    nsfrBuckets: a.nsfrBuckets.map((v, i) => round2(v + b.nsfrBuckets[i])),
    irrbbBuckets: a.irrbbBuckets.map((v, i) => round2(v + b.irrbbBuckets[i])),
  };
}

// ─── Main entry: process all records ─────────────────────────
export type FilterType = "bbi" | "interest" | "both";

export function processRecords(
  records: LoanRecord[],
  method: "annuity" | "flat",
  filter: FilterType,
): CashflowRow[] {
  if (filter === "bbi") {
    return records.map((r) => processOneRecord(r, method, "principal"));
  }
  if (filter === "interest") {
    return records.map((r) => processOneRecord(r, method, "interest"));
  }
  // "both" → sum principal + interest per record
  return records.map((r) => {
    const bbi = processOneRecord(r, method, "principal");
    const interest = processOneRecord(r, method, "interest");
    return sumCashflowRows(bbi, interest);
  });
}

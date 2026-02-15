import { LoanRecord } from "./parser";

// Time bucket definitions: [label, fromMonths, toMonths]
export const TIME_BUCKETS: [string, number, number][] = [
  ["≤ 1 bulan", 0, 1],
  ["1 to ≤ 3 bulan", 1, 3],
  ["3 to ≤ 6 bulan", 3, 6],
  ["6 to ≤ 9 bulan", 6, 9],
  ["9 bulan to ≤ 1Y", 9, 12],
  ["1Y to ≤ 1.5Y", 12, 18],
  ["1.5Y to ≤ 2Y", 18, 24],
  ["2Y to ≤ 3Y", 24, 36],
  ["3Y to ≤ 4Y", 36, 48],
  ["4Y to ≤ 5Y", 48, 60],
  ["5Y to ≤ 6Y", 60, 72],
  ["6Y to ≤ 7Y", 72, 84],
  ["7Y to ≤ 8Y", 84, 96],
  ["8Y to ≤ 9Y", 96, 108],
  ["9Y to ≤ 10Y", 108, 120],
  ["10Y to ≤ 15Y", 120, 180],
  ["15Y to ≤ 20Y", 180, 240],
  ["> 20Y", 240, Infinity],
];

export interface CashflowBBIResult {
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
  cf30d: number; // CF <=30D
  cfGt30d: number; // CF >30D
  cf6m: number; // CF <6M
  cf6mTo12m: number; // CF 6M to 12M
  cfGt12m: number; // CF >12M
  buckets: number[]; // 18 time buckets
}

export interface InterestResult {
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
  cf30d: number; // CF <=30D
  cfGt30d: number; // CF >30D
  cf6m: number; // CF <6M
  cf6mTo12m: number; // CF 6M to 12M
  cfGt12m: number; // CF >12M
  buckets: number[]; // 18 time buckets
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function roundUp(value: number, decimals: number = 0): number {
  if (decimals === 0) {
    return Math.ceil(value);
  }
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

export function calculateCashflowBBI(record: LoanRecord): CashflowBBIResult {
  const remainingDays = daysBetween(record.reportingDate, record.endDate);
  const D = record.outstanding;
  const isInstallment = record.installment.toLowerCase() === "yes";
  const months = roundUp(remainingDays / 30); // ROUNDUP(O/30, 0)

  // CF <=30D
  let cf30d: number;
  if (isInstallment) {
    cf30d = months > 0 ? D / months : D;
  } else {
    cf30d = remainingDays <= 30 ? D : 0;
  }

  // CF >30D
  const cfGt30d = D - cf30d;

  // CF <6M
  let cf6m: number;
  if (isInstallment) {
    cf6m = months > 0 ? (D * Math.min(6, months)) / months : D;
  } else {
    cf6m = remainingDays <= 180 ? D : 0;
  }

  // CF 6M to 12M
  let cf6mTo12m: number;
  if (isInstallment) {
    cf6mTo12m =
      months > 0 ? (D * Math.max(Math.min(months, 12) - 6, 0)) / months : 0;
  } else {
    cf6mTo12m = remainingDays > 180 && remainingDays <= 360 ? D : 0;
  }

  // CF >12M
  let cfGt12m: number;
  if (isInstallment) {
    cfGt12m = months > 0 ? (D * Math.max(months - 12, 0)) / months : 0;
  } else {
    cfGt12m = remainingDays > 360 ? D : 0;
  }

  // Time buckets
  const buckets: number[] = TIME_BUCKETS.map(([, from, to]) => {
    if (isInstallment) {
      if (months <= 0) return 0;
      const bucketMonths = Math.max(
        Math.min(months, to) - Math.min(months, from),
        0,
      );
      return (D * bucketMonths) / months;
    } else {
      // For non-installment: lump sum placed in the bucket where months falls
      if (to === Infinity) {
        return months > from ? D : 0;
      }
      return months > from && months <= to ? D : 0;
    }
  });

  return {
    reportingDate: record.reportingDate,
    accountId: record.accountId,
    ccy: record.ccy,
    outstanding: D,
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
    cf30d,
    cfGt30d,
    cf6m,
    cf6mTo12m,
    cfGt12m,
    buckets,
  };
}

export function calculateInterest(
  record: LoanRecord,
  bbiResult: CashflowBBIResult,
): InterestResult {
  const D = record.outstanding;
  const E = record.interestRate; // already decimal
  const remainingDays = bbiResult.remainingDays;

  // CF <=30D: E * (D / 12)
  const cf30d = E * (D / 12);

  // CF >30D through CF >12M are zero
  const cfGt30d = 0;
  const cf6m = 0;
  const cf6mTo12m = 0;
  const cfGt12m = 0;

  // Time buckets for interest
  // Each bucket uses: (Outstanding - sum of BBI buckets up to this point) * (rate/12) * bucketSpanMonths
  const bbiBuckets = bbiResult.buckets;
  const buckets: number[] = [];

  let cumulativeBBI = 0;

  for (let i = 0; i < TIME_BUCKETS.length; i++) {
    const [, from, to] = TIME_BUCKETS[i];
    const spanMonths = to === Infinity ? 0 : to - from; // >20Y gets 0

    if (i === 0) {
      // ≤ 1 bulan: D * (E/12)
      buckets.push(D * (E / 12));
    } else {
      // Remaining principal after previous buckets' BBI cashflows
      const remainingPrincipal = D - cumulativeBBI;
      if (spanMonths > 0 && remainingPrincipal > 0) {
        buckets.push(remainingPrincipal * (E / 12) * spanMonths);
      } else {
        buckets.push(0);
      }
    }
    cumulativeBBI += bbiBuckets[i];
  }

  return {
    reportingDate: record.reportingDate,
    accountId: record.accountId,
    ccy: record.ccy,
    outstanding: D,
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
    cf30d,
    cfGt30d,
    cf6m,
    cf6mTo12m,
    cfGt12m,
    buckets,
  };
}

export function processRecords(records: LoanRecord[]): {
  bbiResults: CashflowBBIResult[];
  interestResults: InterestResult[];
} {
  const bbiResults = records.map((r) => calculateCashflowBBI(r));
  const interestResults = records.map((r, i) =>
    calculateInterest(r, bbiResults[i]),
  );
  return { bbiResults, interestResults };
}

"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  CashflowRow,
  IRRBB_LABELS,
  LCR_LABELS,
  NSFR_LABELS,
} from "../lib/cashflow";

/* Column definitions (same as main page) */
interface ColDef {
  key: string;
  label: string;
  group: string;
  getValue: (row: CashflowRow) => string | number;
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function fmtNum(n: number): string {
  if (n === 0) return "-";
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

const ALL_COLUMNS: ColDef[] = [
  {
    key: "reportingDate",
    label: "Reporting Date",
    group: "Input",
    getValue: (r) => fmtDate(r.reportingDate),
  },
  {
    key: "accountId",
    label: "Account ID",
    group: "Input",
    getValue: (r) => r.accountId,
  },
  { key: "ccy", label: "CCY", group: "Input", getValue: (r) => r.ccy },
  {
    key: "outstanding",
    label: "Outstanding",
    group: "Input",
    getValue: (r) => r.outstanding,
  },
  {
    key: "interestRate",
    label: "Interest Rate",
    group: "Input",
    getValue: (r) => r.interestRate,
  },
  {
    key: "startDate",
    label: "Start Date",
    group: "Input",
    getValue: (r) => fmtDate(r.startDate),
  },
  {
    key: "endDate",
    label: "End Date",
    group: "Input",
    getValue: (r) => fmtDate(r.endDate),
  },
  {
    key: "installment",
    label: "Installment",
    group: "Input",
    getValue: (r) => r.installment,
  },
  {
    key: "productType",
    label: "Product Type",
    group: "Input",
    getValue: (r) => r.productType,
  },
  {
    key: "segment",
    label: "Segment",
    group: "Input",
    getValue: (r) => r.segment,
  },
  { key: "daerah", label: "Daerah", group: "Input", getValue: (r) => r.daerah },
  {
    key: "kodePos",
    label: "KodePos",
    group: "Input",
    getValue: (r) => r.kodePos,
  },
  {
    key: "insuredUninsured",
    label: "Insured/Uninsured",
    group: "Input",
    getValue: (r) => r.insuredUninsured,
  },
  {
    key: "transactional",
    label: "Transactional/Non",
    group: "Input",
    getValue: (r) => r.transactional,
  },
  {
    key: "remainingDays",
    label: "Rem. Days",
    group: "RemDays",
    getValue: (r) => r.remainingDays,
  },
  ...LCR_LABELS.map((label, i) => ({
    key: `lcr_${i}`,
    label,
    group: "CF LCR",
    getValue: (r: CashflowRow) => r.lcrBuckets[i],
  })),
  ...NSFR_LABELS.map((label, i) => ({
    key: `nsfr_${i}`,
    label,
    group: "CF NSFR",
    getValue: (r: CashflowRow) => r.nsfrBuckets[i],
  })),
  ...IRRBB_LABELS.map((label, i) => ({
    key: `irrbb_${i}`,
    label,
    group: "CF IRRBB",
    getValue: (r: CashflowRow) => r.irrbbBuckets[i],
  })),
];

export default function DrilldownPage() {
  const [data, setData] = useState<CashflowRow[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const rawData = sessionStorage.getItem("bb_drilldown_data");
      const rawFilters = sessionStorage.getItem("bb_drilldown_filters");
      const rawColumns = sessionStorage.getItem("bb_drilldown_columns");

      if (!rawData || !rawFilters) return;

      const parsedData: CashflowRow[] = JSON.parse(rawData).map(
        (r: Record<string, unknown>) => ({
          ...r,
          reportingDate: new Date(r.reportingDate as string),
          startDate: new Date(r.startDate as string),
          endDate: new Date(r.endDate as string),
        }),
      );

      const parsedFilters: Record<string, string> = JSON.parse(rawFilters);
      const parsedColumns: string[] = rawColumns
        ? JSON.parse(rawColumns)
        : ALL_COLUMNS.map((c) => c.key);

      setFilters(parsedFilters);
      setVisibleKeys(new Set(parsedColumns));

      // Apply filters
      const filtered = parsedData.filter((row) => {
        for (const [key, val] of Object.entries(parsedFilters)) {
          const col = ALL_COLUMNS.find((c) => c.key === key);
          if (!col) continue;
          if (String(col.getValue(row)) !== val) return false;
        }
        return true;
      });

      setData(filtered);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  const visibleCols = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleKeys.has(c.key)),
    [visibleKeys],
  );

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">BB</div>
          <div>
            <div className="header-title">Drill-Down View</div>
            <div className="header-subtitle">Filtered Data Detail</div>
          </div>
        </div>
        <button className="btn-sample" onClick={() => window.close()}>
          ✕ Close
        </button>
      </header>

      <div className="main-container">
        {/* Filter badges */}
        <div className="drilldown-filters">
          <span className="drilldown-label">Active Filters:</span>
          {Object.entries(filters).map(([key, val]) => {
            const col = ALL_COLUMNS.find((c) => c.key === key);
            return (
              <span key={key} className="drilldown-badge">
                {col?.label || key} = <strong>{val}</strong>
              </span>
            );
          })}
        </div>

        <div className="stats-bar fade-in" style={{ marginBottom: "1.5rem" }}>
          <div className="stat-card">
            <div className="stat-label">Matching Records</div>
            <div className="stat-value">{data.length}</div>
          </div>
        </div>

        {loaded && data.length > 0 ? (
          <div className="results-section fade-in">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {visibleCols.map((col, i) => {
                      const prevGroup = i > 0 ? visibleCols[i - 1]?.group : "";
                      return (
                        <th
                          key={col.key}
                          className={
                            col.group !== prevGroup && i > 0
                              ? "col-separator"
                              : ""
                          }
                        >
                          {col.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      {visibleCols.map((col, i) => {
                        const val = col.getValue(row);
                        const prevGroup =
                          i > 0 ? visibleCols[i - 1]?.group : "";
                        return (
                          <td
                            key={col.key}
                            className={
                              col.group !== prevGroup && i > 0
                                ? "col-separator"
                                : ""
                            }
                          >
                            {typeof val === "number"
                              ? col.key === "interestRate"
                                ? fmtPct(val)
                                : col.key === "remainingDays"
                                  ? val
                                  : fmtNum(val)
                              : val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : loaded ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>No matching records</h3>
            <p>No data matches the current filter criteria.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <h3>Loading...</h3>
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import { parseTxtFile, LoanRecord } from "./lib/parser";
import {
  processRecords,
  CashflowRow,
  FilterType,
  IRRBB_LABELS,
  LCR_LABELS,
  NSFR_LABELS,
} from "./lib/cashflow";
import * as XLSX from "xlsx";

/* ============================================================ */
/*  COLUMN DEFINITIONS                                          */
/* ============================================================ */
interface ColDef {
  key: string;
  label: string;
  group: string;
  type: "input" | "result";
  getValue: (row: CashflowRow) => string | number;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatNumber(n: number): string {
  if (n === 0) return "-";
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

const INPUT_COLUMNS: ColDef[] = [
  {
    key: "reportingDate",
    label: "Reporting Date",
    group: "Input",
    type: "input",
    getValue: (r) => formatDate(r.reportingDate),
  },
  {
    key: "accountId",
    label: "Account ID",
    group: "Input",
    type: "input",
    getValue: (r) => r.accountId,
  },
  {
    key: "ccy",
    label: "CCY",
    group: "Input",
    type: "input",
    getValue: (r) => r.ccy,
  },
  {
    key: "outstanding",
    label: "Outstanding",
    group: "Input",
    type: "input",
    getValue: (r) => r.outstanding,
  },
  {
    key: "interestRate",
    label: "Interest Rate",
    group: "Input",
    type: "input",
    getValue: (r) => r.interestRate,
  },
  {
    key: "startDate",
    label: "Start Date",
    group: "Input",
    type: "input",
    getValue: (r) => formatDate(r.startDate),
  },
  {
    key: "endDate",
    label: "End Date",
    group: "Input",
    type: "input",
    getValue: (r) => formatDate(r.endDate),
  },
  {
    key: "installment",
    label: "Installment",
    group: "Input",
    type: "input",
    getValue: (r) => r.installment,
  },
  {
    key: "productType",
    label: "Product Type",
    group: "Input",
    type: "input",
    getValue: (r) => r.productType,
  },
  {
    key: "segment",
    label: "Segment",
    group: "Input",
    type: "input",
    getValue: (r) => r.segment,
  },
  {
    key: "daerah",
    label: "Daerah",
    group: "Input",
    type: "input",
    getValue: (r) => r.daerah,
  },
  {
    key: "kodePos",
    label: "KodePos",
    group: "Input",
    type: "input",
    getValue: (r) => r.kodePos,
  },
  {
    key: "insuredUninsured",
    label: "Insured/Uninsured",
    group: "Input",
    type: "input",
    getValue: (r) => r.insuredUninsured,
  },
  {
    key: "transactional",
    label: "Transactional/Non",
    group: "Input",
    type: "input",
    getValue: (r) => r.transactional,
  },
];

const REMDAYS_COLUMN: ColDef = {
  key: "remainingDays",
  label: "Rem. Days",
  group: "RemDays",
  type: "result",
  getValue: (r) => r.remainingDays,
};

const LCR_COLUMNS: ColDef[] = LCR_LABELS.map((label, i) => ({
  key: `lcr_${i}`,
  label,
  group: "CF LCR",
  type: "result" as const,
  getValue: (r: CashflowRow) => r.lcrBuckets[i],
}));

const NSFR_COLUMNS: ColDef[] = NSFR_LABELS.map((label, i) => ({
  key: `nsfr_${i}`,
  label,
  group: "CF NSFR",
  type: "result" as const,
  getValue: (r: CashflowRow) => r.nsfrBuckets[i],
}));

const IRRBB_COLUMNS: ColDef[] = IRRBB_LABELS.map((label, i) => ({
  key: `irrbb_${i}`,
  label,
  group: "CF IRRBB",
  type: "result" as const,
  getValue: (r: CashflowRow) => r.irrbbBuckets[i],
}));

const ALL_COLUMNS: ColDef[] = [
  ...INPUT_COLUMNS,
  REMDAYS_COLUMN,
  ...LCR_COLUMNS,
  ...NSFR_COLUMNS,
  ...IRRBB_COLUMNS,
];

const COLUMN_GROUPS = [
  { name: "Input", columns: INPUT_COLUMNS.map((c) => c.key) },
  { name: "RemDays", columns: ["remainingDays"] },
  { name: "CF LCR", columns: LCR_COLUMNS.map((c) => c.key) },
  { name: "CF NSFR", columns: NSFR_COLUMNS.map((c) => c.key) },
  { name: "CF IRRBB", columns: IRRBB_COLUMNS.map((c) => c.key) },
];

// Columns that can be used as pivot row fields (text/category)
const PIVOTABLE_KEYS = [
  "reportingDate",
  "accountId",
  "ccy",
  "installment",
  "productType",
  "segment",
  "daerah",
  "kodePos",
  "insuredUninsured",
  "transactional",
];

// Columns that are numeric → get summed in pivot
const NUMERIC_KEYS = new Set([
  "outstanding",
  "interestRate",
  "remainingDays",
  ...LCR_COLUMNS.map((c) => c.key),
  ...NSFR_COLUMNS.map((c) => c.key),
  ...IRRBB_COLUMNS.map((c) => c.key),
]);

/* ============================================================ */
/*  COLUMN SELECTOR COMPONENT                                   */
/* ============================================================ */
function ColumnSelector({
  visibleColumns,
  onToggle,
  pivotRows,
  onTogglePivotRow,
}: {
  visibleColumns: Set<string>;
  onToggle: (keys: string[]) => void;
  pivotRows: string[];
  onTogglePivotRow: (key: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroupExpand = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <div className="column-selector">
      <div className="column-selector-title">📋 Columns & Pivot</div>
      <div className="column-groups-container">
        {COLUMN_GROUPS.map((group) => {
          const allChecked = group.columns.every((k) => visibleColumns.has(k));
          const someChecked = group.columns.some((k) => visibleColumns.has(k));
          const expanded = expandedGroups.has(group.name);

          return (
            <div key={group.name} className="column-group-item">
              <div className="column-group-header">
                <button
                  className="column-group-expand"
                  onClick={() => toggleGroupExpand(group.name)}
                >
                  {expanded ? "▾" : "▸"}
                </button>
                <label className="column-group-checkbox">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked && !allChecked;
                    }}
                    onChange={() => onToggle(group.columns)}
                  />
                  <span className="column-group-name">{group.name}</span>
                  <span className="column-group-count">
                    ({group.columns.filter((k) => visibleColumns.has(k)).length}
                    /{group.columns.length})
                  </span>
                </label>
              </div>
              {expanded && (
                <div className="column-group-children">
                  {group.columns.map((key) => {
                    const col = ALL_COLUMNS.find((c) => c.key === key)!;
                    const isPivotable = PIVOTABLE_KEYS.includes(key);
                    const isPivotActive = pivotRows.includes(key);
                    return (
                      <div key={key} className="column-child-item">
                        <label className="column-child-checkbox">
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(key)}
                            onChange={() => onToggle([key])}
                          />
                          <span>{col.label}</span>
                        </label>
                        {isPivotable && (
                          <button
                            className={`pivot-btn ${isPivotActive ? "active" : ""}`}
                            onClick={() => onTogglePivotRow(key)}
                            title={
                              isPivotActive
                                ? "Remove from pivot grouping"
                                : "Add to pivot grouping"
                            }
                          >
                            {isPivotActive
                              ? `⊟ Row ${pivotRows.indexOf(key) + 1}`
                              : "⊞ Pivot"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pivotRows.length > 0 && (
        <div className="pivot-order">
          <div className="pivot-order-title">Pivot Row Order:</div>
          {pivotRows.map((key, i) => {
            const col = ALL_COLUMNS.find((c) => c.key === key)!;
            return (
              <span key={key} className="pivot-order-tag">
                {i + 1}. {col.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/*  PIVOT TABLE LOGIC                                           */
/* ============================================================ */
interface PivotGroup {
  keys: Record<string, string>;
  rows: CashflowRow[];
  children: PivotGroup[];
}

function buildPivotGroups(
  rows: CashflowRow[],
  pivotKeys: string[],
  depth: number = 0,
): PivotGroup[] {
  if (depth >= pivotKeys.length) return [];

  const key = pivotKeys[depth];
  const col = ALL_COLUMNS.find((c) => c.key === key)!;
  const grouped = new Map<string, CashflowRow[]>();

  for (const row of rows) {
    const val = String(col.getValue(row));
    if (!grouped.has(val)) grouped.set(val, []);
    grouped.get(val)!.push(row);
  }

  return Array.from(grouped.entries()).map(([val, groupRows]) => ({
    keys: { [key]: val },
    rows: groupRows,
    children: buildPivotGroups(groupRows, pivotKeys, depth + 1),
  }));
}

function aggregateRows(rows: CashflowRow[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const col of ALL_COLUMNS) {
    if (NUMERIC_KEYS.has(col.key)) {
      sums[col.key] = rows.reduce((s, r) => s + (col.getValue(r) as number), 0);
    }
  }
  return sums;
}

/* ============================================================ */
/*  PIVOT TABLE COMPONENT                                       */
/* ============================================================ */
function PivotTable({
  data,
  visibleColumns,
  pivotRows,
  onDrillDown,
}: {
  data: CashflowRow[];
  visibleColumns: Set<string>;
  pivotRows: string[];
  onDrillDown: (filters: Record<string, string>) => void;
}) {
  const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const resultCols = visibleCols.filter((c) => NUMERIC_KEYS.has(c.key));
  const isPivot = pivotRows.length > 0;

  const groups = useMemo(
    () => (isPivot ? buildPivotGroups(data, pivotRows) : []),
    [data, pivotRows, isPivot],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Regular table (no pivot)
  if (!isPivot) {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {visibleCols.map((col, i) => (
                <th
                  key={col.key}
                  className={getGroupBorderClass(col, visibleCols, i)}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                {visibleCols.map((col, i) => {
                  const val = col.getValue(row);
                  return (
                    <td
                      key={col.key}
                      className={getGroupBorderClass(col, visibleCols, i)}
                    >
                      {typeof val === "number"
                        ? col.key === "interestRate"
                          ? formatPercent(val)
                          : col.key === "remainingDays"
                            ? val
                            : formatNumber(val)
                        : val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Pivot table
  const pivotCols = pivotRows
    .map((k) => ALL_COLUMNS.find((c) => c.key === k)!)
    .filter(Boolean);

  const renderGroup = (
    group: PivotGroup,
    depth: number,
    parentKeys: Record<string, string>,
    parentId: string,
  ): React.ReactNode[] => {
    const key = pivotRows[depth];
    const col = ALL_COLUMNS.find((c) => c.key === key)!;
    const val = group.keys[key];
    const currentKeys = { ...parentKeys, [key]: val };
    const groupId = parentId + "|" + key + "=" + val;
    const isCollapsed = collapsed.has(groupId);
    const agg = aggregateRows(group.rows);
    const nodes: React.ReactNode[] = [];

    // Group header row
    nodes.push(
      <tr key={groupId} className={`pivot-group-row depth-${depth}`}>
        <td
          className="pivot-group-cell"
          colSpan={pivotCols.length}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          <button
            className="pivot-toggle"
            onClick={() => toggleCollapse(groupId)}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
          <span className="pivot-group-label">{col.label}:</span>
          <button
            className="pivot-group-value"
            onClick={() => onDrillDown(currentKeys)}
            title="Click to drill down"
          >
            {val}
          </button>
          <span className="pivot-group-count">({group.rows.length})</span>
        </td>
        {resultCols.map((rc) => (
          <td key={rc.key} className="pivot-agg-cell">
            {rc.key === "interestRate"
              ? formatPercent(agg[rc.key] / group.rows.length)
              : rc.key === "remainingDays"
                ? Math.round(agg[rc.key])
                : formatNumber(agg[rc.key])}
          </td>
        ))}
      </tr>,
    );

    // Children
    if (!isCollapsed) {
      if (group.children.length > 0) {
        for (const child of group.children) {
          nodes.push(...renderGroup(child, depth + 1, currentKeys, groupId));
        }
      }
    }

    return nodes;
  };

  return (
    <div className="table-wrapper">
      <table className="data-table pivot-table">
        <thead>
          <tr>
            <th colSpan={pivotCols.length} className="pivot-header-group">
              Grouped By
            </th>
            {resultCols.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{groups.flatMap((g) => renderGroup(g, 0, {}, "root"))}</tbody>
      </table>
    </div>
  );
}

function getGroupBorderClass(
  col: ColDef,
  visibleCols: ColDef[],
  idx: number,
): string {
  if (idx === 0) return "";
  const prevGroup = visibleCols[idx - 1]?.group;
  return col.group !== prevGroup ? "col-separator" : "";
}

/* ============================================================ */
/*  MAIN PAGE                                                   */
/* ============================================================ */
export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<LoanRecord[]>([]);
  const [results, setResults] = useState<CashflowRow[]>([]);
  const [filter, setFilter] = useState<FilterType>("both");
  const [method, setMethod] = useState<"annuity" | "flat">("annuity");
  const [error, setError] = useState<string | null>(null);
  const [processed, setProcessed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(ALL_COLUMNS.map((c) => c.key)),
  );

  // Pivot row fields
  const [pivotRows, setPivotRows] = useState<string[]>([]);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setProcessed(false);
    setResults([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseTxtFile(text);
      setRecords(parsed);
      const res = processRecords(parsed, method, filter);
      setResults(res);
      setProcessed(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [file, method, filter]);

  // Re-process when filter/method changes (if already processed)
  const handleFilterChange = useCallback(
    (f: FilterType) => {
      setFilter(f);
      if (records.length > 0) {
        const res = processRecords(records, method, f);
        setResults(res);
      }
    },
    [records, method],
  );

  const handleMethodChange = useCallback(
    (m: "annuity" | "flat") => {
      setMethod(m);
      if (records.length > 0) {
        const res = processRecords(records, m, filter);
        setResults(res);
      }
    },
    [records, filter],
  );

  const handleDownloadSample = useCallback(() => {
    const a = document.createElement("a");
    a.href = "/sample_data.csv";
    a.download = "sample_data.csv";
    a.click();
  }, []);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setRecords([]);
    setResults([]);
    setProcessed(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const toggleColumns = useCallback((keys: string[]) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) {
        keys.forEach((k) => next.delete(k));
      } else {
        keys.forEach((k) => next.add(k));
      }
      return next;
    });
  }, []);

  const togglePivotRow = useCallback((key: string) => {
    setPivotRows((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }, []);

  // Drill-down: open new page with filters
  const handleDrillDown = useCallback(
    (filters: Record<string, string>) => {
      // Store data in sessionStorage
      sessionStorage.setItem(
        "bb_drilldown_data",
        JSON.stringify(
          results.map((r) => ({
            ...r,
            reportingDate: r.reportingDate.toISOString(),
            startDate: r.startDate.toISOString(),
            endDate: r.endDate.toISOString(),
          })),
        ),
      );
      sessionStorage.setItem("bb_drilldown_filters", JSON.stringify(filters));
      sessionStorage.setItem(
        "bb_drilldown_columns",
        JSON.stringify(Array.from(visibleColumns)),
      );
      window.open("/drilldown", "_blank");
    },
    [results, visibleColumns],
  );

  // Excel export
  const handleExportExcel = useCallback(() => {
    if (!results.length) return;

    const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));

    // Check if pivot mode
    if (pivotRows.length > 0) {
      // Export pivot data
      const groups = buildPivotGroups(results, pivotRows);
      const pivotCols = pivotRows.map(
        (k) => ALL_COLUMNS.find((c) => c.key === k)!,
      );
      const resultCols = visibleCols.filter((c) => NUMERIC_KEYS.has(c.key));

      const exportRows: Record<string, string | number>[] = [];

      const addGroup = (group: PivotGroup, depth: number) => {
        const key = pivotRows[depth];
        const col = ALL_COLUMNS.find((c) => c.key === key)!;
        const agg = aggregateRows(group.rows);

        const row: Record<string, string | number> = {};
        for (const pc of pivotCols) {
          row[pc.label] = pc.key === key ? group.keys[key] : "";
        }
        for (const rc of resultCols) {
          row[rc.label] = Math.round(agg[rc.key] * 100) / 100;
        }
        row["Count"] = group.rows.length;
        exportRows.push(row);

        for (const child of group.children) {
          addGroup(child, depth + 1);
        }
      };

      for (const g of groups) addGroup(g, 0);

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pivot");
      XLSX.writeFile(wb, "cashflow_pivot.xlsx");
    } else {
      // Export raw data
      const exportRows = results.map((row) => {
        const obj: Record<string, string | number> = {};
        for (const col of visibleCols) {
          const val = col.getValue(row);
          obj[col.label] = val;
        }
        return obj;
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cashflow");
      XLSX.writeFile(wb, "cashflow_output.xlsx");
    }
  }, [results, visibleColumns, pivotRows]);

  /* Stats */
  const totalOutstanding = records.reduce((s, r) => s + r.outstanding, 0);
  const uniqueCurrencies = [...new Set(records.map((r) => r.ccy))];

  const filterLabel: Record<FilterType, string> = {
    bbi: "Installment Cashflow BBI",
    interest: "Installment Interest",
    both: "Combined (BBI + Interest)",
  };

  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">BB</div>
          <div>
            <div className="header-title">BetterBankings Software</div>
            <div className="header-subtitle">Cashflow Analysis Engine</div>
          </div>
        </div>
        <button className="btn-sample" onClick={handleDownloadSample}>
          📥 Download Sample CSV
        </button>
      </header>

      {/* MAIN */}
      <div className="main-container">
        {/* UPLOAD */}
        <div className="upload-section">
          <div
            className={`upload-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="upload-icon">📄</span>
            <div className="upload-text-main">
              Drop your file here or click to browse
            </div>
            <div className="upload-text-sub">
              Supports <span>.csv</span> and <span>.txt</span> files — tab,
              semicolon, or comma delimited
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.tsv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {file && (
            <div className="file-info fade-in">
              <span className="file-info-icon">📎</span>
              <div>
                <div className="file-info-name">{file.name}</div>
                <div className="file-info-details">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button className="file-info-remove" onClick={handleRemoveFile}>
                ✕
              </button>
            </div>
          )}
        </div>

        {/* ERROR */}
        {error && (
          <div className="error-box fade-in">
            <span className="error-icon">⚠️</span>
            <div className="error-text">{error}</div>
          </div>
        )}

        {/* CONTROLS */}
        <div className="controls-bar">
          <div className="controls-left">
            {/* Method toggle */}
            <div className="method-group">
              <span className="method-label">Method:</span>
              <div className="filter-group">
                <button
                  className={`filter-btn ${method === "annuity" ? "active" : ""}`}
                  onClick={() => handleMethodChange("annuity")}
                >
                  Annuity
                </button>
                <button
                  className={`filter-btn ${method === "flat" ? "active" : ""}`}
                  onClick={() => handleMethodChange("flat")}
                >
                  Flat
                </button>
              </div>
            </div>

            {/* Filter toggle */}
            <div className="filter-group">
              <button
                className={`filter-btn ${filter === "bbi" ? "active" : ""}`}
                onClick={() => handleFilterChange("bbi")}
              >
                Cashflow BBI
              </button>
              <button
                className={`filter-btn ${filter === "interest" ? "active" : ""}`}
                onClick={() => handleFilterChange("interest")}
              >
                Interest
              </button>
              <button
                className={`filter-btn ${filter === "both" ? "active" : ""}`}
                onClick={() => handleFilterChange("both")}
              >
                Both (Sum)
              </button>
            </div>
          </div>

          <div className="controls-right">
            {processed && results.length > 0 && (
              <button className="btn-export" onClick={handleExportExcel}>
                📥 Export Excel
              </button>
            )}
            <button
              className="btn-process"
              disabled={!file}
              onClick={handleProcess}
            >
              ▶ Process Cashflow
            </button>
          </div>
        </div>

        {/* STATS */}
        {processed && records.length > 0 && (
          <div className="stats-bar fade-in">
            <div className="stat-card">
              <div className="stat-label">Total Records</div>
              <div className="stat-value">{records.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Outstanding</div>
              <div className="stat-value small">
                {totalOutstanding.toLocaleString("id-ID", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Currencies</div>
              <div className="stat-value small">
                {uniqueCurrencies.join(", ")}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Method</div>
              <div
                className="stat-value small"
                style={{ textTransform: "capitalize" }}
              >
                {method}
              </div>
            </div>
          </div>
        )}

        {/* COLUMN SELECTOR & RESULTS */}
        {processed && results.length > 0 && (
          <div className="results-layout fade-in">
            <ColumnSelector
              visibleColumns={visibleColumns}
              onToggle={toggleColumns}
              pivotRows={pivotRows}
              onTogglePivotRow={togglePivotRow}
            />

            <div className="results-main">
              <div className="results-header">
                <h2>{filterLabel[filter]}</h2>
                <span className="results-badge">
                  {filter === "both" ? "BBI + Interest" : filter.toUpperCase()}
                </span>
                {pivotRows.length > 0 && (
                  <span className="results-badge pivot-badge">Pivot Mode</span>
                )}
              </div>

              <PivotTable
                data={results}
                visibleColumns={visibleColumns}
                pivotRows={pivotRows}
                onDrillDown={handleDrillDown}
              />
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!processed && !error && (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">📊</div>
            <h3>No data yet</h3>
            <p>
              Upload a TXT/CSV file with your loan data, then click{" "}
              <strong>&quot;Process Cashflow&quot;</strong> to see the results.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

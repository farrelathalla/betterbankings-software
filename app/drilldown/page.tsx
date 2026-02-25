"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
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

const NUMERIC_KEYS = new Set([
  "outstanding",
  "interestRate",
  "remainingDays",
  ...LCR_LABELS.map((_, i) => `lcr_${i}`),
  ...NSFR_LABELS.map((_, i) => `nsfr_${i}`),
  ...IRRBB_LABELS.map((_, i) => `irrbb_${i}`),
]);

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
    key: "method",
    label: "Method",
    group: "Input",
    getValue: (r) => r.method,
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

/* ============================================================ */
/*  FILTER TYPES & COMPONENTS (same as main page)               */
/* ============================================================ */
interface ColumnFilterState {
  selectedValues: Set<string>;
  sortDirection: "asc" | "desc" | null;
  searchText: string;
  numberMin: string;
  numberMax: string;
}

function getDefaultFilterState(): ColumnFilterState {
  return {
    selectedValues: new Set<string>(),
    sortDirection: null,
    searchText: "",
    numberMin: "",
    numberMax: "",
  };
}

function isFilterActive(
  fs: ColumnFilterState | undefined,
  allValues: string[],
): boolean {
  if (!fs) return false;
  if (fs.sortDirection !== null) return true;
  if (fs.numberMin !== "" || fs.numberMax !== "") return true;
  if (fs.selectedValues.size > 0 && fs.selectedValues.size < allValues.length)
    return true;
  return false;
}

function FilterDropdown({
  colKey,
  colLabel,
  isNumeric,
  allValues,
  filterState,
  onApply,
  onClose,
}: {
  colKey: string;
  colLabel: string;
  isNumeric: boolean;
  allValues: string[];
  filterState: ColumnFilterState;
  onApply: (key: string, state: ColumnFilterState) => void;
  onClose: () => void;
}) {
  const [localState, setLocalState] = useState<ColumnFilterState>(() => ({
    ...filterState,
    selectedValues: new Set(
      filterState.selectedValues.size > 0
        ? filterState.selectedValues
        : allValues,
    ),
  }));
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filteredValues = allValues.filter((v) =>
    v.toLowerCase().includes(localState.searchText.toLowerCase()),
  );

  const allSelected = filteredValues.every((v) =>
    localState.selectedValues.has(v),
  );

  const toggleSelectAll = () => {
    setLocalState((prev) => {
      const next = new Set(prev.selectedValues);
      if (allSelected) {
        filteredValues.forEach((v) => next.delete(v));
      } else {
        filteredValues.forEach((v) => next.add(v));
      }
      return { ...prev, selectedValues: next };
    });
  };

  const toggleValue = (val: string) => {
    setLocalState((prev) => {
      const next = new Set(prev.selectedValues);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...prev, selectedValues: next };
    });
  };

  const handleApply = () => {
    const finalState = { ...localState };
    if (finalState.selectedValues.size === allValues.length) {
      finalState.selectedValues = new Set<string>();
    }
    onApply(colKey, finalState);
    onClose();
  };

  const handleClear = () => {
    onApply(colKey, getDefaultFilterState());
    onClose();
  };

  return (
    <div
      className="filter-dropdown"
      ref={dropdownRef}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-dropdown-header">
        <span className="filter-dropdown-title">Filter: {colLabel}</span>
        <button className="filter-dropdown-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="filter-dropdown-sort">
        <button
          className={`filter-sort-btn ${localState.sortDirection === "asc" ? "active" : ""}`}
          onClick={() =>
            setLocalState((prev) => ({
              ...prev,
              sortDirection: prev.sortDirection === "asc" ? null : "asc",
            }))
          }
        >
          ↑ Sort A→Z
        </button>
        <button
          className={`filter-sort-btn ${localState.sortDirection === "desc" ? "active" : ""}`}
          onClick={() =>
            setLocalState((prev) => ({
              ...prev,
              sortDirection: prev.sortDirection === "desc" ? null : "desc",
            }))
          }
        >
          ↓ Sort Z→A
        </button>
      </div>
      {isNumeric && (
        <div className="filter-dropdown-range">
          <span className="filter-range-label">Range:</span>
          <input
            type="text"
            placeholder="Min"
            className="filter-range-input"
            value={localState.numberMin}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, numberMin: e.target.value }))
            }
          />
          <span className="filter-range-sep">–</span>
          <input
            type="text"
            placeholder="Max"
            className="filter-range-input"
            value={localState.numberMax}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, numberMax: e.target.value }))
            }
          />
        </div>
      )}
      <div className="filter-dropdown-search">
        <input
          type="text"
          placeholder="Search values..."
          className="filter-search-input"
          value={localState.searchText}
          onChange={(e) =>
            setLocalState((prev) => ({ ...prev, searchText: e.target.value }))
          }
        />
      </div>
      <div className="filter-dropdown-selectall">
        <label className="filter-checkbox-label">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
          />
          <span>(Select All)</span>
        </label>
      </div>
      <div className="filter-dropdown-values">
        {filteredValues.map((val) => (
          <label key={val} className="filter-checkbox-label">
            <input
              type="checkbox"
              checked={localState.selectedValues.has(val)}
              onChange={() => toggleValue(val)}
            />
            <span>{val || "(blank)"}</span>
          </label>
        ))}
        {filteredValues.length === 0 && (
          <div className="filter-no-values">No matching values</div>
        )}
      </div>
      <div className="filter-dropdown-actions">
        <button className="filter-action-clear" onClick={handleClear}>
          Clear
        </button>
        <button className="filter-action-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  );
}

function FilterableHeader({
  col,
  className,
  data,
  columnFilters,
  onApplyFilter,
}: {
  col: ColDef;
  className: string;
  data: CashflowRow[];
  columnFilters: Record<string, ColumnFilterState>;
  onApplyFilter: (key: string, state: ColumnFilterState) => void;
}) {
  const [open, setOpen] = useState(false);

  const allValues = useMemo(() => {
    const set = new Set<string>();
    for (const row of data) {
      set.add(String(col.getValue(row)));
    }
    return Array.from(set).sort();
  }, [data, col]);

  const isActive = isFilterActive(columnFilters[col.key], allValues);
  const isNum = NUMERIC_KEYS.has(col.key);

  return (
    <th className={`${className} filterable-header`}>
      <div className="filter-header-content">
        <span>{col.label}</span>
        <button
          className={`filter-header-btn ${isActive ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          title="Filter this column"
        >
          ▼
        </button>
      </div>
      {open && (
        <FilterDropdown
          colKey={col.key}
          colLabel={col.label}
          isNumeric={isNum}
          allValues={allValues}
          filterState={columnFilters[col.key] || getDefaultFilterState()}
          onApply={onApplyFilter}
          onClose={() => setOpen(false)}
        />
      )}
    </th>
  );
}

/* ============================================================ */
/*  DRILLDOWN PAGE                                              */
/* ============================================================ */
export default function DrilldownPage() {
  const [data, setData] = useState<CashflowRow[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilterState>
  >({});

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

  const handleApplyFilter = useCallback(
    (key: string, state: ColumnFilterState) => {
      setColumnFilters((prev) => {
        const next = { ...prev };
        if (
          state.selectedValues.size === 0 &&
          state.sortDirection === null &&
          state.numberMin === "" &&
          state.numberMax === ""
        ) {
          delete next[key];
        } else {
          next[key] = state;
        }
        return next;
      });
    },
    [],
  );

  // Apply column filters
  const filteredData = useMemo(() => {
    let result = [...data];

    for (const [key, fs] of Object.entries(columnFilters)) {
      const col = ALL_COLUMNS.find((c) => c.key === key);
      if (!col) continue;

      if (fs.selectedValues.size > 0) {
        result = result.filter((row) =>
          fs.selectedValues.has(String(col.getValue(row))),
        );
      }

      if (NUMERIC_KEYS.has(key)) {
        if (fs.numberMin !== "") {
          const min = parseFloat(fs.numberMin);
          if (!isNaN(min)) {
            result = result.filter(
              (row) => (col.getValue(row) as number) >= min,
            );
          }
        }
        if (fs.numberMax !== "") {
          const max = parseFloat(fs.numberMax);
          if (!isNaN(max)) {
            result = result.filter(
              (row) => (col.getValue(row) as number) <= max,
            );
          }
        }
      }
    }

    const sortEntries = Object.entries(columnFilters).filter(
      ([, fs]) => fs.sortDirection !== null,
    );
    if (sortEntries.length > 0) {
      const [sortKey, sortFs] = sortEntries[sortEntries.length - 1];
      const sortCol = ALL_COLUMNS.find((c) => c.key === sortKey);
      if (sortCol && sortFs.sortDirection) {
        const dir = sortFs.sortDirection === "asc" ? 1 : -1;
        result.sort((a, b) => {
          const va = sortCol.getValue(a);
          const vb = sortCol.getValue(b);
          if (typeof va === "number" && typeof vb === "number") {
            return (va - vb) * dir;
          }
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
    }

    return result;
  }, [data, columnFilters]);

  const activeFilterCount = Object.keys(columnFilters).length;

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
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {activeFilterCount > 0 && (
            <button
              className="btn-clear-filters"
              onClick={() => setColumnFilters({})}
            >
              ✕ Clear Filters ({activeFilterCount})
            </button>
          )}
          <button className="btn-sample" onClick={() => window.close()}>
            ✕ Close
          </button>
        </div>
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
          <div className="stat-card">
            <div className="stat-label">Showing</div>
            <div className="stat-value">
              {filteredData.length} / {data.length}
            </div>
          </div>
        </div>

        {loaded && filteredData.length > 0 ? (
          <div className="results-section fade-in">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {visibleCols.map((col, i) => {
                      const prevGroup = i > 0 ? visibleCols[i - 1]?.group : "";
                      return (
                        <FilterableHeader
                          key={col.key}
                          col={col}
                          className={
                            col.group !== prevGroup && i > 0
                              ? "col-separator"
                              : ""
                          }
                          data={data}
                          columnFilters={columnFilters}
                          onApplyFilter={handleApplyFilter}
                        />
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
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

"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import ReactDOM from "react-dom";
import LoginPage from "./components/LoginPage";
import {
  isLoggedIn,
  logout,
  getUsername,
  isSuperAdmin,
  uploadCSV,
  waitForProcessing,
  getResults,
  getSummary,
  downloadExport,
  getPivot,
  getFilterOptions,
  listBehaviours,
  uploadBehaviour,
  deleteBehaviour,
  updateBehaviour,
  reprocessUpload,
  loadAllReferenceMaps,
  listPresets,
  createPreset,
  updatePreset as apiUpdatePreset,
  deletePreset as apiDeletePreset,
  UploadStatus,
  ResultRow,
  PivotGroup as APIPivotGroup,
  SummaryResponse,
  ValidationError,
  Behaviour,
  PresetConfig,
  ReferenceMaps,
  IRRBB_LABELS,
  LCR_LABELS,
  NSFR_LABELS,
  ILAAP_LABELS,
} from "./lib/api";

/* ============================================================ */
/*  TYPES                                                       */
/* ============================================================ */
type FilterType = "bbi" | "interest" | "both";

/* ============================================================ */
/*  COLUMN DEFINITIONS                                          */
/* ============================================================ */
interface ColDef {
  key: string;
  label: string;
  group: string;
  type: "input" | "result";
  getValue: (row: ResultRow) => string | number;
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

/* ============================================================ */
/*  REFERENCE MAP HELPERS                                       */
/* ============================================================ */
function mapValue(
  refMaps: ReferenceMaps,
  table: string,
  rawValue: string | number | null | undefined,
): string {
  if (rawValue == null || rawValue === "") return "-";
  const key = String(rawValue);
  const map = refMaps[table];
  if (map && map[key]) return map[key];
  return key;
}

/** Merge principal+interest maps from a ResultRow into a single value for a bucket label */
function getBucketValue(
  row: ResultRow,
  bucketType: "irrbb" | "lcr" | "nsfr" | "ilaap",
  label: string,
  filterType: FilterType,
): number {
  const pKey = `${bucketType}_principal` as keyof ResultRow;
  const iKey = `${bucketType}_interest` as keyof ResultRow;
  const pMap = (row[pKey] as Record<string, number> | null) || {};
  const iMap = (row[iKey] as Record<string, number> | null) || {};
  const p = pMap[label] || 0;
  const i = iMap[label] || 0;
  if (filterType === "bbi") return p;
  if (filterType === "interest") return i;
  return p + i;
}

function buildColumns(
  filterType: FilterType,
  refMaps: ReferenceMaps,
): ColDef[] {
  const inputCols: ColDef[] = [
    {
      key: "reporting_date",
      label: "Reporting Date",
      group: "Input",
      type: "input",
      getValue: (r) => r.reporting_date,
    },
    {
      key: "account_id",
      label: "Account ID",
      group: "Input",
      type: "input",
      getValue: (r) => r.account_id,
    },
    {
      key: "ccy",
      label: "CCY",
      group: "Input",
      type: "input",
      getValue: (r) => mapValue(refMaps, "currencies", r.ccy),
    },
    {
      key: "outstanding",
      label: "Outstanding",
      group: "Input",
      type: "input",
      getValue: (r) => r.outstanding,
    },
    {
      key: "interest_rate",
      label: "Interest Rate",
      group: "Input",
      type: "input",
      getValue: (r) => r.interest_rate,
    },
    {
      key: "start_date",
      label: "Start Date",
      group: "Input",
      type: "input",
      getValue: (r) => r.start_date,
    },
    {
      key: "end_date",
      label: "End Date",
      group: "Input",
      type: "input",
      getValue: (r) => r.end_date,
    },
    {
      key: "installment_frequency",
      label: "Installment Freq.",
      group: "Input",
      type: "input",
      getValue: (r) =>
        r.installment_frequency != null
          ? mapValue(
              refMaps,
              "installment_frequencies",
              r.installment_frequency,
            )
          : "-",
    },
    {
      key: "product_type",
      label: "Product Type",
      group: "Input",
      type: "input",
      getValue: (r) => mapValue(refMaps, "product_types", r.product_type),
    },
    {
      key: "segment",
      label: "Segment",
      group: "Input",
      type: "input",
      getValue: (r) => mapValue(refMaps, "segments", r.segment),
    },
    {
      key: "daerah",
      label: "Daerah",
      group: "Input",
      type: "input",
      getValue: (r) => r.daerah,
    },
    {
      key: "kode_pos",
      label: "KodePos",
      group: "Input",
      type: "input",
      getValue: (r) => r.kode_pos,
    },
    {
      key: "insured_or_uninsured",
      label: "Insured/Uninsured",
      group: "Input",
      type: "input",
      getValue: (r) => r.insured_or_uninsured,
    },
    {
      key: "transactional_or_non",
      label: "Transactional/Non",
      group: "Input",
      type: "input",
      getValue: (r) =>
        mapValue(refMaps, "transactional_types", r.transactional_or_non),
    },
    {
      key: "method",
      label: "Method",
      group: "Input",
      type: "input",
      getValue: (r) => mapValue(refMaps, "methods", r.method),
    },
    {
      key: "interest_payment_frequency",
      label: "Int. Pay Freq.",
      group: "Input",
      type: "input",
      getValue: (r) =>
        r.interest_payment_frequency != null
          ? mapValue(
              refMaps,
              "installment_frequencies",
              r.interest_payment_frequency,
            )
          : "-",
    },
    {
      key: "day_count",
      label: "Day Count",
      group: "Input",
      type: "input",
      getValue: (r) => mapValue(refMaps, "day_counts", r.day_count),
    },
    {
      key: "remaining_days",
      label: "Remaining Days",
      group: "Input",
      type: "input",
      getValue: (r) => r.remaining_days,
    },
    {
      key: "account_number",
      label: "Account Number",
      group: "Input",
      type: "input",
      getValue: (r) => r.account_number,
    },
    {
      key: "instrument_type",
      label: "Instrument Type",
      group: "Input",
      type: "input",
      getValue: (r) => mapValue(refMaps, "instrument_types", r.instrument_type),
    },
    {
      key: "market_value",
      label: "Market Value",
      group: "Input",
      type: "input",
      getValue: (r) => r.market_value,
    },
    {
      key: "asset_liability",
      label: "Asset/Liability",
      group: "Input",
      type: "input",
      getValue: (r) => r.asset_liability,
    },
    {
      key: "margin",
      label: "Margin",
      group: "Input",
      type: "input",
      getValue: (r) => r.margin,
    },
    {
      key: "revolving_flag",
      label: "Revolving Flag",
      group: "Input",
      type: "input",
      getValue: (r) => r.revolving_flag,
    },
    {
      key: "result_type",
      label: "Result Type",
      group: "Result Type",
      type: "input",
      getValue: (r) => r.result_type,
    },
  ];

  const lcrCols: ColDef[] = LCR_LABELS.map((label) => ({
    key: `lcr__${label}`,
    label,
    group: "CF LCR",
    type: "result" as const,
    getValue: (r: ResultRow) => getBucketValue(r, "lcr", label, filterType),
  }));

  const nsfrCols: ColDef[] = NSFR_LABELS.map((label) => ({
    key: `nsfr__${label}`,
    label,
    group: "CF NSFR",
    type: "result" as const,
    getValue: (r: ResultRow) => getBucketValue(r, "nsfr", label, filterType),
  }));

  const irrbbCols: ColDef[] = IRRBB_LABELS.map((label) => ({
    key: `irrbb__${label}`,
    label,
    group: "CF IRRBB",
    type: "result" as const,
    getValue: (r: ResultRow) => getBucketValue(r, "irrbb", label, filterType),
  }));

  const ilaapCols: ColDef[] = ILAAP_LABELS.map((label) => ({
    key: `ilaap__${label}`,
    label,
    group: "CF ILAAP",
    type: "result" as const,
    getValue: (r: ResultRow) => getBucketValue(r, "ilaap", label, filterType),
  }));

  return [...inputCols, ...lcrCols, ...nsfrCols, ...irrbbCols, ...ilaapCols];
}

const INPUT_KEYS = [
  "reporting_date",
  "account_id",
  "ccy",
  "outstanding",
  "interest_rate",
  "start_date",
  "end_date",
  "installment_frequency",
  "product_type",
  "segment",
  "daerah",
  "kode_pos",
  "insured_or_uninsured",
  "transactional_or_non",
  "method",
  "interest_payment_frequency",
  "day_count",
  "remaining_days",
  "account_number",
  "instrument_type",
  "market_value",
  "asset_liability",
  "margin",
  "revolving_flag",
  "result_type",
];

const PIVOTABLE_KEYS = [
  "reporting_date",
  "account_id",
  "ccy",
  "installment_frequency",
  "product_type",
  "segment",
  "daerah",
  "kode_pos",
  "insured_or_uninsured",
  "transactional_or_non",
  "method",
  "result_type",
];
function getColumnGroups(allColumns: ColDef[]) {
  return [
    {
      name: "Input",
      columns: allColumns.filter((c) => c.group === "Input").map((c) => c.key),
    },
    {
      name: "Result Type",
      columns: allColumns
        .filter((c) => c.group === "Result Type")
        .map((c) => c.key),
    },
    {
      name: "CF LCR",
      columns: allColumns.filter((c) => c.group === "CF LCR").map((c) => c.key),
    },
    {
      name: "CF NSFR",
      columns: allColumns
        .filter((c) => c.group === "CF NSFR")
        .map((c) => c.key),
    },
    {
      name: "CF IRRBB",
      columns: allColumns
        .filter((c) => c.group === "CF IRRBB")
        .map((c) => c.key),
    },
  ];
}

function isNumericKey(key: string): boolean {
  return (
    key === "outstanding" ||
    key === "interest_rate" ||
    key === "remaining_days" ||
    key.startsWith("lcr__") ||
    key.startsWith("nsfr__") ||
    key.startsWith("irrbb__")
  );
}

/* ============================================================ */
/*  COLUMN FILTER TYPES & HELPERS                               */
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

/* ============================================================ */
/*  FILTER DROPDOWN COMPONENT                                   */
/* ============================================================ */
function FilterDropdown({
  colKey,
  colLabel,
  isNumeric,
  allValues,
  filterState,
  onApply,
  onClose,
  posTop,
  posLeft,
}: {
  colKey: string;
  colLabel: string;
  isNumeric: boolean;
  allValues: string[];
  filterState: ColumnFilterState;
  onApply: (key: string, state: ColumnFilterState) => void;
  onClose: () => void;
  posTop: number;
  posLeft: number;
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
      style={{ top: posTop, left: posLeft }}
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
          className={`filter-sort-btn ${
            localState.sortDirection === "asc" ? "active" : ""
          }`}
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
          className={`filter-sort-btn ${
            localState.sortDirection === "desc" ? "active" : ""
          }`}
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

/* ============================================================ */
/*  COLUMN SELECTOR COMPONENT                                   */
/* ============================================================ */
function PresetView({
  preset: p,
  allColumns,
  results,
  distinctValues,
  summary,
  uploadId,
  filterType,
  behaviourId,
}: {
  preset: PresetConfig;
  allColumns: ColDef[];
  results: ResultRow[];
  distinctValues: Record<string, string[]>;
  summary: SummaryResponse | null;
  uploadId: string;
  filterType: string;
  behaviourId: number | null;
}) {
  const [pivotData, setPivotData] = useState<APIPivotGroup[]>([]);
  const [pivotLoading, setPivotLoading] = useState(false);

  const pivotRows = p.config?.pivotRows || [];
  const isPivot = pivotRows.length > 0;

  useEffect(() => {
    if (isPivot && uploadId) {
      setPivotLoading(true);
      // Construct inclusion filters for the pivot API.
      // Preset stores excludeValues. Inclusion = All - Exclude.
      const filters: Record<string, string[]> = {};
      (p.config?.valueFilters || []).forEach((f) => {
        const allVals = distinctValues[f.column] || [];
        const allowed = allVals.filter((v) => !f.excludeValues.includes(v));
        if (allowed.length < allVals.length) {
          filters[f.column] = allowed;
        }
      });

      // We need to cast filters to any because our lib type might still be Record<string, string>
      getPivot(uploadId, pivotRows, filterType, filters as any, behaviourId)
        .then(setPivotData)
        .catch(console.error)
        .finally(() => setPivotLoading(false));
    }
  }, [
    isPivot,
    uploadId,
    pivotRows,
    filterType,
    behaviourId,
    p.config?.valueFilters,
    distinctValues,
  ]);

  const presetVisibleCols = useMemo(
    () =>
      new Set<string>(p.config?.visibleColumns || allColumns.map((c) => c.key)),
    [p.config?.visibleColumns, allColumns],
  );

  const presetFilteredSortedData = useMemo(() => {
    let data = results.filter((row) => {
      const filters = p.config?.valueFilters || [];
      for (const f of filters) {
        const rawVal = String((row as any)[f.column] ?? "");
        if (f.excludeValues.includes(rawVal)) return false;
      }
      return true;
    });

    const ordering = p.config?.valueOrdering || [];
    if (ordering.length > 0) {
      data = [...data].sort((a, b) => {
        for (const ord of ordering) {
          const aVal = String((a as any)[ord.column] ?? "");
          const bVal = String((b as any)[ord.column] ?? "");
          const aIdx = ord.values.indexOf(aVal);
          const bIdx = ord.values.indexOf(bVal);
          const aPri = aIdx === -1 ? 999 : aIdx;
          const bPri = bIdx === -1 ? 999 : bIdx;
          if (aPri !== bPri) return aPri - bPri;
        }
        return 0;
      });
    }
    return data;
  }, [results, p.config?.valueFilters, p.config?.valueOrdering]);

  return (
    <div className="preset-table-section">
      <div className="preset-table-header">
        <h3>
          📋 {p.name} {isPivot ? "(Pivot View)" : "(List View)"}
        </h3>
        <span
          className="results-badge"
          style={{
            background: isPivot ? "var(--blue-600)" : "var(--orange-500)",
          }}
        >
          {isPivot ? "PIVOT" : "LIST"}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--gray-400)",
            marginLeft: "1rem",
          }}
        >
          {isPivot
            ? `${pivotData.length} groups`
            : `${presetFilteredSortedData.length} rows`}
        </span>
      </div>

      {isPivot ? (
        pivotLoading ? (
          <div className="loading-container" style={{ minHeight: "100px" }}>
            <div className="loading-spinner"></div>
            <p>Fetching pivot data...</p>
          </div>
        ) : (
          <PivotTableView
            pivotData={pivotData}
            pivotRows={pivotRows}
            visibleColumns={presetVisibleCols}
            allColumns={allColumns}
            onDrillDown={() => {}}
          />
        )
      ) : (
        <ResultTable
          data={presetFilteredSortedData}
          visibleColumns={presetVisibleCols}
          allColumns={allColumns}
          columnFilters={{}}
          onApplyFilter={() => {}}
          distinctValues={distinctValues}
          summary={summary}
        />
      )}
    </div>
  );
}

function ColumnSelector({
  allColumns,
  visibleColumns,
  onToggle,
  pivotRows,
  onTogglePivotRow,
}: {
  allColumns: ColDef[];
  visibleColumns: Set<string>;
  onToggle: (keys: string[]) => void;
  pivotRows: string[];
  onTogglePivotRow: (key: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const columnGroups = useMemo(() => getColumnGroups(allColumns), [allColumns]);

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
        {columnGroups.map((group) => {
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
                    const col = allColumns.find((c) => c.key === key);
                    if (!col) return null;
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
                            className={`pivot-btn ${
                              isPivotActive ? "active" : ""
                            }`}
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
            const col = allColumns.find((c) => c.key === key);
            return (
              <span key={key} className="pivot-order-tag">
                {i + 1}. {col?.label || key}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/*  FILTERABLE HEADER CELL                                      */
/* ============================================================ */
function FilterableHeader({
  col,
  className,
  allValues,
  columnFilters,
  onApplyFilter,
}: {
  col: ColDef;
  className: string;
  allValues: string[];
  columnFilters: Record<string, ColumnFilterState>;
  onApplyFilter: (key: string, state: ColumnFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const isActive = isFilterActive(columnFilters[col.key], allValues);
  const isNum = isNumericKey(col.key);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!open && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4,
          left: Math.max(8, rect.right - 260),
        });
      }
      setOpen(!open);
    },
    [open],
  );

  return (
    <th className={`${className} filterable-header`}>
      <div className="filter-header-content">
        <span>{col.label}</span>
        <button
          ref={btnRef}
          className={`filter-header-btn ${isActive ? "active" : ""}`}
          onClick={handleToggle}
          title="Filter this column"
        >
          ▼
        </button>
      </div>
      {open &&
        ReactDOM.createPortal(
          <FilterDropdown
            colKey={col.key}
            colLabel={col.label}
            isNumeric={isNum}
            allValues={allValues}
            filterState={columnFilters[col.key] || getDefaultFilterState()}
            onApply={onApplyFilter}
            onClose={() => setOpen(false)}
            posTop={dropdownPos.top}
            posLeft={dropdownPos.left}
          />,
          document.body,
        )}
    </th>
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
/*  FLAT RESULT TABLE (no pivot)                                */
/* ============================================================ */
function ResultTable({
  data,
  visibleColumns,
  allColumns,
  columnFilters,
  onApplyFilter,
  distinctValues,
  summary,
}: {
  data: ResultRow[];
  visibleColumns: Set<string>;
  allColumns: ColDef[];
  columnFilters: Record<string, ColumnFilterState>;
  onApplyFilter: (key: string, state: ColumnFilterState) => void;
  distinctValues: Record<string, string[]>;
  summary?: SummaryResponse | null;
}) {
  const visibleCols = allColumns.filter((c) => visibleColumns.has(c.key));

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {visibleCols.map((col, i) => (
              <FilterableHeader
                key={col.key}
                col={col}
                className={getGroupBorderClass(col, visibleCols, i)}
                allValues={distinctValues[col.key] || []}
                columnFilters={columnFilters}
                onApplyFilter={onApplyFilter}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={row.row_number || idx}>
              {visibleCols.map((col, i) => {
                const val = col.getValue(row);
                return (
                  <td
                    key={col.key}
                    className={getGroupBorderClass(col, visibleCols, i)}
                  >
                    {typeof val === "number"
                      ? col.key === "interest_rate"
                        ? formatPercent(val)
                        : col.key === "remaining_days"
                          ? val
                          : formatNumber(val)
                      : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {/* SUM Row as tfoot — same table so columns align */}
        {summary && summary.column_sums && (
          <tfoot>
            <tr className="sum-row">
              {visibleCols.map((col, i) => {
                let cellContent: string | number = "";
                if (col.key === "reporting_date" || col.key === "account_id") {
                  cellContent = i === 0 ? "TOTAL" : "";
                } else if (col.key === "interest_rate") {
                  cellContent = summary.avg_interest_rate
                    ? formatPercent(summary.avg_interest_rate)
                    : "-";
                } else if (col.key === "outstanding") {
                  cellContent = formatNumber(
                    summary.column_sums["outstanding"] || 0,
                  );
                } else if (isNumericKey(col.key)) {
                  const sumKey = col.key.replace("__", "__");
                  const val = summary.column_sums[sumKey] || 0;
                  cellContent = formatNumber(val);
                } else {
                  cellContent = "";
                }
                return (
                  <td
                    key={col.key}
                    className={`sum-cell ${getGroupBorderClass(col, visibleCols, i)}`}
                  >
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ============================================================ */
/*  PIVOT TABLE (server-side data)                              */
/* ============================================================ */
function PivotTableView({
  pivotData,
  pivotRows,
  visibleColumns,
  allColumns,
  onDrillDown,
}: {
  pivotData: APIPivotGroup[];
  pivotRows: string[];
  visibleColumns: Set<string>;
  allColumns: ColDef[];
  onDrillDown: (filters: Record<string, string>) => void;
}) {
  const visibleCols = allColumns.filter((c) => visibleColumns.has(c.key));
  const resultCols = visibleCols.filter((c) => isNumericKey(c.key));
  const pivotCols = pivotRows
    .map((k) => allColumns.find((c) => c.key === k)!)
    .filter(Boolean);

  return (
    <div className="table-wrapper">
      <table className="data-table pivot-table">
        <thead>
          <tr>
            {pivotCols.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            <th className="col-separator">Count</th>
            {resultCols.map((col, i) => (
              <th
                key={col.key}
                className={
                  i === 0
                    ? "col-separator"
                    : getGroupBorderClass(col, resultCols, i)
                }
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pivotData.map((group, idx) => (
            <tr key={idx}>
              {pivotCols.map((pc) => (
                <td key={pc.key} className="pivot-flat-cell">
                  <button
                    className="pivot-group-value"
                    onClick={() => onDrillDown(group.keys)}
                    title="Click to drill down"
                  >
                    {group.keys[pc.key] || "-"}
                  </button>
                </td>
              ))}
              <td className="col-separator pivot-agg-cell">{group.count}</td>
              {resultCols.map((rc, i) => {
                const val = group.aggregates[rc.key] || 0;
                return (
                  <td
                    key={rc.key}
                    className={`pivot-agg-cell ${
                      i === 0 ? "col-separator" : ""
                    }`}
                  >
                    {rc.key === "interest_rate"
                      ? formatPercent(val / (group.count || 1))
                      : rc.key === "remaining_days"
                        ? Math.round(val)
                        : formatNumber(val)}
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

/* ============================================================ */
/*  MAIN PAGE                                                   */
/* ============================================================ */
export default function Home() {
  // Auth
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );

  // Results
  const [results, setResults] = useState<ResultRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [processed, setProcessed] = useState(false);

  // Filter / view
  const [filterType, setFilterType] = useState<FilterType>("both");
  const [error, setError] = useState<string | null>(null);

  // Result type tabs
  const [activeBehaviourId, setActiveBehaviourId] = useState<number | null>(
    null,
  );
  const [scenarios, setScenarios] = useState<Behaviour[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Reference maps
  const [refMaps, setRefMaps] = useState<ReferenceMaps>({});

  // Column visibility
  const allColumns = useMemo(
    () => buildColumns(filterType, refMaps),
    [filterType, refMaps],
  );
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(buildColumns("both", {}).map((c) => c.key)),
  );

  // Pivot
  const [pivotRows, setPivotRows] = useState<string[]>([]);
  const [pivotData, setPivotData] = useState<APIPivotGroup[]>([]);
  const [loadingPivot, setLoadingPivot] = useState(false);

  // Column filters (local for filter dropdown values)
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilterState>
  >({});

  // Distinct values for filter dropdowns
  const [distinctValues, setDistinctValues] = useState<
    Record<string, string[]>
  >({});

  // Summary
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Presets
  const [presets, setPresets] = useState<PresetConfig[]>([]);
  const [activePresetIds, setActivePresetIds] = useState<Set<number>>(
    new Set(),
  );
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetConfig | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetCols, setPresetCols] = useState<Set<string>>(new Set());
  const [presetPivots, setPresetPivots] = useState<string[]>([]);
  const [presetValueFilters, setPresetValueFilters] = useState<
    { column: string; allowedValues: string[] }[]
  >([]);
  const [presetValueOrdering, setPresetValueOrdering] = useState<
    { column: string; values: string[] }[]
  >([]);

  // Load presets on auth
  const fetchPresets = useCallback(async () => {
    try {
      const list = await listPresets();
      setPresets(list);
    } catch {
      /* ignore */
    }
  }, []);

  // Check auth on mount + handle ?upload_id= from history page
  useEffect(() => {
    const loggedIn = isLoggedIn();
    setAuthenticated(loggedIn);
    setAuthChecked(true);

    if (loggedIn) {
      const params = new URLSearchParams(window.location.search);
      const existingUploadId = params.get("upload_id");
      if (existingUploadId) {
        window.history.replaceState({}, "", "/");
        setUploadId(existingUploadId);
      }
      // Load reference maps
      loadAllReferenceMaps()
        .then(setRefMaps)
        .catch(() => {});
      // Load presets
      fetchPresets();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Scenarios
  const fetchScenarios = useCallback(async () => {
    if (!uploadId) return;
    try {
      const list = await listBehaviours(uploadId);
      setScenarios(list.filter((b) => !b.is_default));
    } catch {
      // ignore
    }
  }, [uploadId]);

  useEffect(() => {
    if (uploadId && processed) {
      fetchScenarios();
    }
  }, [uploadId, processed, fetchScenarios]);

  // Fetch distinct values for visible input columns when we have results
  useEffect(() => {
    if (!uploadId || !processed) return;
    const inputKeys = INPUT_KEYS.filter((k) => visibleColumns.has(k));
    inputKeys.forEach(async (key) => {
      if (distinctValues[key]) return;
      try {
        const vals = await getFilterOptions(uploadId, key);
        setDistinctValues((prev) => ({ ...prev, [key]: vals }));
      } catch {
        // ignore
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId, processed, visibleColumns]);

  // Fetch results when uploadId, filterType, or activeBehaviourId changes
  const loadResults = useCallback(async () => {
    if (!uploadId) return;
    setProcessing(true);
    setProcessProgress("Loading results...");
    try {
      const pageData = await getResults(uploadId, {
        page: 1,
        limit: 20,
        filter_type: filterType,
        behaviour_id: activeBehaviourId,
      });
      setResults(pageData.data || []);
      setTotalRows(pageData.total);
      setCurrentPage(1);
      setTotalPages(pageData.total_pages);
      setProcessed(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
      setProcessProgress("");
    }
  }, [uploadId, filterType, activeBehaviourId]);

  useEffect(() => {
    if (uploadId) loadResults();
  }, [loadResults, uploadId]);

  // Fetch summary when uploadId, filterType, or activeBehaviourId changes
  useEffect(() => {
    if (!uploadId || !processed) return;
    getSummary(uploadId, filterType, {}, activeBehaviourId)
      .then(setSummary)
      .catch(() => {});
  }, [uploadId, filterType, processed, activeBehaviourId]);

  // Fetch pivot data when pivotRows or activeBehaviourId change
  useEffect(() => {
    if (!uploadId || !processed || pivotRows.length === 0) return;
    setLoadingPivot(true);
    getPivot(uploadId, pivotRows, filterType, {}, activeBehaviourId)
      .then((data) => {
        setPivotData(data);
        setLoadingPivot(false);
      })
      .catch(() => setLoadingPivot(false));
  }, [uploadId, processed, pivotRows, filterType, activeBehaviourId]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleLoginSuccess = useCallback(() => {
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthenticated(false);
    setProcessed(false);
    setResults([]);
    setUploadId(null);
    setSummary(null);
  }, []);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setProcessed(false);
    setResults([]);
    setValidationErrors([]);
    setUploadId(null);
    setSummary(null);
    setPivotData([]);
    setColumnFilters({});
    setDistinctValues({});
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

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setResults([]);
    setProcessed(false);
    setError(null);
    setValidationErrors([]);
    setUploadId(null);
    setSummary(null);
    setPivotData([]);
    setColumnFilters({});
    setDistinctValues({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setError(null);
    setValidationErrors([]);
    setProcessing(true);
    setProcessProgress("Uploading file...");

    try {
      const uploadRes = await uploadCSV(file);

      if (uploadRes.errors && uploadRes.errors.length > 0) {
        setValidationErrors(uploadRes.errors);
        setProcessing(false);
        setProcessProgress("");
        return;
      }

      setUploadId(uploadRes.id);
      setProcessProgress("Processing cashflow calculations...");

      const finalStatus = await waitForProcessing(
        uploadRes.id,
        (status: UploadStatus) => {
          if (status.status === "processing") {
            setProcessProgress(
              `Processing... ${status.total_rows} rows queued`,
            );
          }
        },
      );

      if (finalStatus.status === "failed") {
        setError(finalStatus.error_message || "Processing failed");
        setProcessing(false);
        setProcessProgress("");
        return;
      }

      setProcessProgress("Loading results...");
      await loadResults();
      await fetchScenarios();
    } catch (err: unknown) {
      const error = err as Error & { validationErrors?: ValidationError[] };
      if (error.validationErrors) {
        setValidationErrors(error.validationErrors);
      } else {
        setError(error.message);
      }
      setProcessing(false);
      setProcessProgress("");
    }
  }, [file, filterType]);

  const handleLoadMore = useCallback(async () => {
    if (!uploadId || loadingMore || currentPage >= totalPages) return;
    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const pageData = await getResults(uploadId, {
        page: nextPage,
        limit: 20,
        filter_type: filterType,
        behaviour_id: activeBehaviourId,
      });
      setResults((prev) => [...prev, ...(pageData.data || [])]);
      setCurrentPage(nextPage);
    } catch {
      // ignore
    }
    setLoadingMore(false);
  }, [uploadId, currentPage, totalPages, loadingMore, filterType]);

  const handleFilterTypeChange = useCallback(
    async (ft: FilterType) => {
      setFilterType(ft);
      if (!uploadId || !processed) return;

      try {
        const pageData = await getResults(uploadId, {
          page: 1,
          limit: 20,
          filter_type: ft,
        });
        setResults(pageData.data || []);
        setTotalRows(pageData.total);
        setCurrentPage(1);
        setTotalPages(pageData.total_pages);
      } catch {
        // ignore
      }
    },
    [uploadId, processed],
  );

  const handleDownloadSample = useCallback(() => {
    const a = document.createElement("a");
    a.href = "/sample_data.csv";
    a.download = "sample_data.csv";
    a.click();
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

  // Apply client-side filters on loaded data
  const filteredResults = useMemo(() => {
    let data = [...results];

    for (const [key, fs] of Object.entries(columnFilters)) {
      const col = allColumns.find((c) => c.key === key);
      if (!col) continue;

      if (fs.selectedValues.size > 0) {
        data = data.filter((row) => {
          const val = String(col.getValue(row));
          return fs.selectedValues.has(val);
        });
      }

      if (isNumericKey(key)) {
        if (fs.numberMin !== "") {
          const min = parseFloat(fs.numberMin);
          if (!isNaN(min)) {
            data = data.filter((row) => (col.getValue(row) as number) >= min);
          }
        }
        if (fs.numberMax !== "") {
          const max = parseFloat(fs.numberMax);
          if (!isNaN(max)) {
            data = data.filter((row) => (col.getValue(row) as number) <= max);
          }
        }
      }
    }

    const sortEntries = Object.entries(columnFilters).filter(
      ([, fs]) => fs.sortDirection !== null,
    );
    if (sortEntries.length > 0) {
      const [sortKey, sortFs] = sortEntries[sortEntries.length - 1];
      const sortCol = allColumns.find((c) => c.key === sortKey);
      if (sortCol && sortFs.sortDirection) {
        const dir = sortFs.sortDirection === "asc" ? 1 : -1;
        data.sort((a, b) => {
          const va = sortCol.getValue(a);
          const vb = sortCol.getValue(b);
          if (typeof va === "number" && typeof vb === "number") {
            return (va - vb) * dir;
          }
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
    }

    return data;
  }, [results, columnFilters, allColumns]);

  // Drill-down: open new page with URL params
  const handleDrillDown = useCallback(
    (filters: Record<string, string>) => {
      if (!uploadId) return;
      const params = new URLSearchParams();
      params.set("upload_id", uploadId);
      params.set("filter_type", filterType);
      params.set("filters", JSON.stringify(filters));
      params.set("columns", JSON.stringify(Array.from(visibleColumns)));
      window.open(`/drilldown?${params.toString()}`, "_blank");
    },
    [uploadId, filterType, visibleColumns],
  );

  // Export Excel via BE
  const handleExportExcel = useCallback(async () => {
    if (!uploadId) return;
    setExporting(true);
    try {
      await downloadExport(uploadId, filterType, {}, activeBehaviourId);
    } catch (err) {
      setError((err as Error).message);
    }
    setExporting(false);
  }, [uploadId, filterType, activeBehaviourId]);

  // Scenario Handlers
  const handleAddScenario = async () => {
    const name = prompt("Enter Scenario Name:");
    if (!name) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setRefreshing(true);
        const res = await uploadBehaviour(uploadId!, file, name);
        await reprocessUpload(uploadId!);
        await fetchScenarios();
        setActiveBehaviourId(res.id);
        alert("Scenario added and reprocessed.");
      } catch (err: any) {
        alert(err.message);
      } finally {
        setRefreshing(false);
      }
    };
    input.click();
  };

  const handleEditScenario = async (id: number) => {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    const newName = prompt("Rename Scenario:", sc.name);
    if (newName === null) return;
    try {
      setRefreshing(true);
      await updateBehaviour(id, newName);
      await fetchScenarios();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshScenario = async (id: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setRefreshing(true);
        await updateBehaviour(id, undefined, file);
        await reprocessUpload(uploadId!);
        alert("Scenario file updated and reprocessed.");
        loadResults();
      } catch (err: any) {
        alert(err.message);
      } finally {
        setRefreshing(false);
      }
    };
    input.click();
  };

  const handleDeleteScenario = async (id: number) => {
    if (!confirm("Are you sure you want to delete this scenario?")) return;
    try {
      setRefreshing(true);
      await deleteBehaviour(id);
      if (activeBehaviourId === id) setActiveBehaviourId(null);
      await fetchScenarios();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const filterLabel: Record<FilterType, string> = {
    bbi: "Principal",
    interest: "Interest",
    both: "Principal + Interest",
  };

  const activeFilterCount = Object.keys(columnFilters).length;
  const isPivot = pivotRows.length > 0;

  // ─── Auth gate ───
  if (!authChecked) {
    return (
      <div className="loading-fullscreen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

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
        <div className="header-actions">
          <button className="btn-sample" onClick={handleDownloadSample}>
            📥 Sample CSV
          </button>
          <a href="/history" className="btn-sample header-nav-link">
            📂 History
          </a>
          {isSuperAdmin() && (
            <a href="/admin" className="btn-sample header-nav-link">
              ⚙ Admin
            </a>
          )}
          <div className="header-user">
            <span className="header-username">{getUsername()}</span>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
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
              Supports <span>.csv</span>, <span>.txt</span>, and{" "}
              <span>.xlsx</span> files — tab, semicolon, or comma delimited
              (CSV/TXT) or Excel format (XLSX)
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.tsv,.xlsx,.xls"
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

        {/* VALIDATION ERRORS */}
        {validationErrors.length > 0 && (
          <div className="error-box fade-in">
            <span className="error-icon">⚠️</span>
            <div className="error-text">
              <strong>CSV Validation Failed</strong>
              <div className="validation-errors-list">
                {validationErrors.slice(0, 20).map((ve, i) => (
                  <div key={i} className="validation-error-item">
                    Row {ve.row}, Column &quot;{ve.column}&quot;: {ve.message}
                  </div>
                ))}
                {validationErrors.length > 20 && (
                  <div className="validation-error-item">
                    ...and {validationErrors.length - 20} more errors
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="error-box fade-in">
            <span className="error-icon">⚠️</span>
            <div className="error-text">{error}</div>
          </div>
        )}

        {/* PROCESSING STATE */}
        {processing && (
          <div className="processing-overlay fade-in">
            <div className="processing-card">
              <div className="loading-spinner" />
              <div className="processing-text">{processProgress}</div>
            </div>
          </div>
        )}

        {/* Tab Bar */}
        {processed && uploadId && (
          <div className="scenario-tabs-container scale-in">
            <div className="scenario-tabs">
              <button
                className={`scenario-tab ${activeBehaviourId === null ? "active" : ""}`}
                onClick={() => setActiveBehaviourId(null)}
              >
                All Results
              </button>
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  className={`scenario-tab ${activeBehaviourId === sc.id ? "active" : ""}`}
                  onClick={() => setActiveBehaviourId(sc.id)}
                >
                  {sc.name}
                </button>
              ))}
              <button
                className="scenario-tab-add"
                onClick={handleAddScenario}
                title="Add Scenario"
              >
                +
              </button>
            </div>

            {activeBehaviourId !== null && (
              <div className="scenario-controls">
                <button
                  className="btn-sc-control"
                  onClick={() => handleEditScenario(activeBehaviourId)}
                >
                  ✏️ Edit Name
                </button>
                <button
                  className="btn-sc-control"
                  onClick={() => handleRefreshScenario(activeBehaviourId)}
                >
                  🔄 Refresh File
                </button>
                <button
                  className="btn-sc-control btn-sc-delete"
                  onClick={() => handleDeleteScenario(activeBehaviourId)}
                >
                  🗑️ Delete
                </button>
              </div>
            )}
            {refreshing && (
              <div
                style={{
                  padding: "0.5rem",
                  color: "#fb923c",
                  fontWeight: "bold",
                  fontSize: "0.8rem",
                }}
              >
                ⌛ Processing changes...
              </div>
            )}
          </div>
        )}

        {/* CONTROLS */}
        <div className="controls-bar">
          <div className="controls-left">
            <div className="filter-group">
              <button
                className={`filter-btn ${filterType === "bbi" ? "active" : ""}`}
                onClick={() => handleFilterTypeChange("bbi")}
              >
                Principal
              </button>
              <button
                className={`filter-btn ${
                  filterType === "interest" ? "active" : ""
                }`}
                onClick={() => handleFilterTypeChange("interest")}
              >
                Interest
              </button>
              <button
                className={`filter-btn ${
                  filterType === "both" ? "active" : ""
                }`}
                onClick={() => handleFilterTypeChange("both")}
              >
                Principal + Interest
              </button>
            </div>
          </div>

          <div className="controls-right">
            {activeFilterCount > 0 && (
              <button
                className="btn-clear-filters"
                onClick={() => setColumnFilters({})}
                title="Clear all column filters"
              >
                ✕ Clear Filters ({activeFilterCount})
              </button>
            )}
            <button
              className="btn-process"
              disabled={!file || processing}
              onClick={handleProcess}
            >
              {processing ? "⏳ Processing..." : "▶ Process Cashflow"}
            </button>
          </div>
        </div>

        {/* STATS */}
        {processed && summary && (
          <div className="stats-bar fade-in">
            <div className="stat-card">
              <div className="stat-label">Total Records</div>
              <div className="stat-value">{summary.total_count}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Outstanding</div>
              <div className="stat-value small">
                {summary.total_outstanding.toLocaleString("id-ID", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Currencies</div>
              <div className="stat-value small">
                {summary.currencies?.join(", ") || "-"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Showing</div>
              <div className="stat-value small">
                {filteredResults.length} of {totalRows} rows
              </div>
            </div>
          </div>
        )}

        {/* PRESET BAR */}
        {processed && (
          <div className="preset-bar fade-in">
            <span className="preset-bar-label">🗂️ Presets</span>
            <div className="preset-bar-items">
              {presets.map((p) => (
                <div key={p.id} className="preset-item">
                  <input
                    type="checkbox"
                    checked={activePresetIds.has(p.id!)}
                    onChange={() => {
                      setActivePresetIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id!)) next.delete(p.id!);
                        else next.add(p.id!);
                        return next;
                      });
                    }}
                  />
                  <span className="preset-item-name">{p.name}</span>
                  <div className="preset-item-actions">
                    <button
                      className="preset-item-btn"
                      onClick={() => {
                        setEditingPreset(p);
                        setPresetName(p.name);
                        setPresetCols(
                          new Set(
                            p.config?.visibleColumns ||
                              allColumns.map((c) => c.key),
                          ),
                        );
                        setPresetPivots(p.config?.pivotRows || []);
                        // Convert excludeValues to allowedValues for the UI
                        const vf = (p.config?.valueFilters || []).map((f) => ({
                          column: f.column,
                          allowedValues: (
                            distinctValues[f.column] || []
                          ).filter((v) => !f.excludeValues.includes(v)),
                        }));
                        setPresetValueFilters(vf);
                        setPresetValueOrdering(p.config?.valueOrdering || []);
                        setPresetModalOpen(true);
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      className="preset-item-btn delete"
                      onClick={async () => {
                        if (!confirm(`Delete preset "${p.name}"?`)) return;
                        try {
                          await apiDeletePreset(p.id!);
                          setPresets((prev) =>
                            prev.filter((x) => x.id !== p.id),
                          );
                          setActivePresetIds((prev) => {
                            const next = new Set(prev);
                            next.delete(p.id!);
                            return next;
                          });
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn-new-preset"
              style={{ width: "auto", marginTop: 0 }}
              onClick={() => {
                setEditingPreset(null);
                setPresetName("");
                setPresetCols(new Set(allColumns.map((c) => c.key)));
                setPresetPivots([]);
                setPresetValueFilters([]);
                setPresetValueOrdering([]);
                setPresetModalOpen(true);
              }}
            >
              + New Preset
            </button>
          </div>
        )}

        {/* COLUMN SELECTOR & RESULTS */}
        {processed && (
          <div className="results-layout fade-in">
            <ColumnSelector
              allColumns={allColumns}
              visibleColumns={visibleColumns}
              onToggle={toggleColumns}
              pivotRows={pivotRows}
              onTogglePivotRow={togglePivotRow}
            />

            <div className="results-main">
              <div className="results-header">
                <h2>{filterLabel[filterType]}</h2>
                <span className="results-badge">
                  {filterType === "both"
                    ? "Principal + Interest"
                    : filterType === "bbi"
                      ? "PRINCIPAL"
                      : filterType.toUpperCase()}
                </span>
                <button
                  className="btn-export"
                  onClick={handleExportExcel}
                  disabled={exporting}
                >
                  {exporting ? "⏳ Exporting..." : "📥 Export Excel"}
                </button>
                {isPivot && (
                  <span className="results-badge pivot-badge">Pivot Mode</span>
                )}
              </div>

              {isPivot ? (
                loadingPivot ? (
                  <div className="loading-section">
                    <div className="loading-spinner" />
                    <span>Loading pivot data...</span>
                  </div>
                ) : (
                  <PivotTableView
                    pivotData={pivotData}
                    pivotRows={pivotRows}
                    visibleColumns={visibleColumns}
                    allColumns={allColumns}
                    onDrillDown={handleDrillDown}
                  />
                )
              ) : (
                <>
                  <ResultTable
                    data={filteredResults}
                    visibleColumns={visibleColumns}
                    allColumns={allColumns}
                    columnFilters={columnFilters}
                    onApplyFilter={handleApplyFilter}
                    distinctValues={distinctValues}
                    summary={summary}
                  />
                  {currentPage < totalPages && (
                    <div className="load-more-container">
                      <button
                        className="btn-load-more"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore
                          ? "Loading..."
                          : `Load More (${results.length} of ${totalRows})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!processed && !error && !processing && (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">📊</div>
            <h3>No data yet</h3>
            <p>
              Upload a CSV/TXT/XLSX file with your loan data, then click{" "}
              <strong>&quot;Process Cashflow&quot;</strong> to see the results.
            </p>
          </div>
        )}

        {/* PRESET TABLES */}
        {processed && activePresetIds.size > 0 && (
          <div className="preset-tables-container fade-in">
            {presets
              .filter((p) => activePresetIds.has(p.id!))
              .map((p) => (
                <PresetView
                  key={p.id}
                  preset={p}
                  allColumns={allColumns}
                  results={results}
                  distinctValues={distinctValues}
                  summary={summary}
                  uploadId={uploadId || ""}
                  filterType={filterType}
                  behaviourId={activeBehaviourId}
                />
              ))}
          </div>
        )}

        {/* PRESET EDITOR MODAL */}
        {presetModalOpen && (
          <div
            className="preset-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPresetModalOpen(false);
            }}
          >
            <div className="preset-modal">
              <h3>{editingPreset ? "Edit Preset" : "New Preset"}</h3>

              {/* NAME */}
              <div className="preset-modal-field">
                <label className="preset-modal-label">Name</label>
                <input
                  className="preset-modal-input"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g. Tampilan A"
                />
              </div>

              {/* COLUMNS — group-based like ColumnSelector */}
              <div className="preset-modal-field">
                <label className="preset-modal-label">Columns</label>
                <div
                  className="preset-modal-columns"
                  style={{ flexDirection: "column", gap: "4px" }}
                >
                  {getColumnGroups(allColumns).map((group) => {
                    const allChecked = group.columns.every((k) =>
                      presetCols.has(k),
                    );
                    const someChecked = group.columns.some((k) =>
                      presetCols.has(k),
                    );
                    return (
                      <div key={group.name} style={{ marginBottom: "4px" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => {
                              if (el)
                                el.indeterminate = someChecked && !allChecked;
                            }}
                            onChange={() => {
                              setPresetCols((prev) => {
                                const next = new Set(prev);
                                if (allChecked) {
                                  group.columns.forEach((k) => next.delete(k));
                                } else {
                                  group.columns.forEach((k) => next.add(k));
                                }
                                return next;
                              });
                            }}
                            style={{ accentColor: "var(--orange-500)" }}
                          />
                          <span
                            style={{
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              color: "var(--orange-400)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {group.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              color: "var(--gray-500)",
                              marginLeft: "auto",
                            }}
                          >
                            (
                            {
                              group.columns.filter((k) => presetCols.has(k))
                                .length
                            }
                            /{group.columns.length})
                          </span>
                        </label>
                        <div
                          style={{
                            paddingLeft: "1.2rem",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                            marginTop: "2px",
                          }}
                        >
                          {group.columns.map((key) => {
                            const col = allColumns.find((c) => c.key === key);
                            if (!col) return null;
                            return (
                              <button
                                key={key}
                                className={`preset-col-chip ${presetCols.has(key) ? "selected" : ""}`}
                                onClick={() => {
                                  setPresetCols((prev) => {
                                    const next = new Set(prev);
                                    next.has(key)
                                      ? next.delete(key)
                                      : next.add(key);
                                    return next;
                                  });
                                }}
                              >
                                {col.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PIVOT ROWS */}
              <div className="preset-modal-field">
                <label className="preset-modal-label">Pivot Rows</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {PIVOTABLE_KEYS.map((key) => {
                    const col = allColumns.find((c) => c.key === key);
                    if (!col) return null;
                    const isActive = presetPivots.includes(key);
                    return (
                      <button
                        key={key}
                        className={`pivot-btn ${isActive ? "active" : ""}`}
                        onClick={() => {
                          setPresetPivots((prev) =>
                            prev.includes(key)
                              ? prev.filter((k) => k !== key)
                              : [...prev, key],
                          );
                        }}
                      >
                        {col.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* VALUE FILTERS & ORDERING */}
              <div className="preset-modal-field">
                <label className="preset-modal-label">
                  Value Filters & Ordering
                </label>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--gray-400)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Select which values to include per column. Drag or reorder to
                  set priority.
                </div>
                {PIVOTABLE_KEYS.map((key) => {
                  const col = allColumns.find((c) => c.key === key);
                  if (!col) return null;
                  const allVals = distinctValues[key] || [];
                  if (allVals.length === 0) return null;

                  const currentFilter = presetValueFilters.find(
                    (f) => f.column === key,
                  );
                  const currentOrder = presetValueOrdering.find(
                    (o) => o.column === key,
                  );
                  const allowedVals = currentFilter?.allowedValues || allVals;
                  const orderedVals = currentOrder?.values || [];

                  return (
                    <div
                      key={key}
                      style={{
                        marginBottom: "0.6rem",
                        padding: "0.5rem",
                        background: "rgba(0,0,0,0.15)",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--orange-400)",
                          marginBottom: "0.35rem",
                        }}
                      >
                        {col.label}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                        }}
                      >
                        {allVals.map((val) => {
                          const isIncluded = allowedVals.includes(val);
                          const orderIdx = orderedVals.indexOf(val);
                          return (
                            <button
                              key={val}
                              className={`preset-col-chip ${isIncluded ? "selected" : ""}`}
                              onClick={() => {
                                // Toggle inclusion
                                setPresetValueFilters((prev) => {
                                  const existing = prev.find(
                                    (f) => f.column === key,
                                  );
                                  if (existing) {
                                    const newAllowed = isIncluded
                                      ? existing.allowedValues.filter(
                                          (v) => v !== val,
                                        )
                                      : [...existing.allowedValues, val];
                                    return prev.map((f) =>
                                      f.column === key
                                        ? { ...f, allowedValues: newAllowed }
                                        : f,
                                    );
                                  } else {
                                    // First time: exclude this one value
                                    return [
                                      ...prev,
                                      {
                                        column: key,
                                        allowedValues: allVals.filter(
                                          (v) => v !== val,
                                        ),
                                      },
                                    ];
                                  }
                                });
                                // Also update ordering: if removing, remove from order
                                if (isIncluded) {
                                  setPresetValueOrdering((prev) =>
                                    prev.map((o) =>
                                      o.column === key
                                        ? {
                                            ...o,
                                            values: o.values.filter(
                                              (v) => v !== val,
                                            ),
                                          }
                                        : o,
                                    ),
                                  );
                                }
                              }}
                              style={{ position: "relative" }}
                            >
                              {val || "(empty)"}
                              {isIncluded && orderIdx >= 0 && (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: "-4px",
                                    right: "-4px",
                                    background: "var(--orange-500)",
                                    color: "white",
                                    borderRadius: "50%",
                                    width: "14px",
                                    height: "14px",
                                    fontSize: "0.55rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 800,
                                  }}
                                >
                                  {orderIdx + 1}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {/* Ordering: click on included values to set priority */}
                      {allowedVals.length > 0 &&
                        allowedVals.length < allVals.length && (
                          <div
                            style={{
                              marginTop: "0.35rem",
                              fontSize: "0.68rem",
                              color: "var(--gray-500)",
                            }}
                          >
                            Order priority (click to add/remove):
                            <div
                              style={{
                                display: "flex",
                                gap: "4px",
                                marginTop: "2px",
                                flexWrap: "wrap",
                              }}
                            >
                              {allowedVals.map((val) => {
                                const idx = orderedVals.indexOf(val);
                                return (
                                  <button
                                    key={val}
                                    className={`preset-col-chip ${idx >= 0 ? "selected" : ""}`}
                                    style={{
                                      fontSize: "0.65rem",
                                      padding: "0.15rem 0.4rem",
                                    }}
                                    onClick={() => {
                                      setPresetValueOrdering((prev) => {
                                        const existing = prev.find(
                                          (o) => o.column === key,
                                        );
                                        if (existing) {
                                          const newVals =
                                            idx >= 0
                                              ? existing.values.filter(
                                                  (v) => v !== val,
                                                )
                                              : [...existing.values, val];
                                          return prev.map((o) =>
                                            o.column === key
                                              ? { ...o, values: newVals }
                                              : o,
                                          );
                                        } else {
                                          return [
                                            ...prev,
                                            { column: key, values: [val] },
                                          ];
                                        }
                                      });
                                    }}
                                  >
                                    {idx >= 0 ? `${idx + 1}. ` : ""}
                                    {val || "(empty)"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>

              <div className="preset-modal-actions">
                <button
                  className="btn-preset-cancel"
                  onClick={() => setPresetModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-preset-save"
                  onClick={async () => {
                    if (!presetName.trim()) return;
                    // Convert allowedValues to excludeValues for storage
                    const valueFilters = presetValueFilters
                      .filter((f) => {
                        const allVals = distinctValues[f.column] || [];
                        return f.allowedValues.length < allVals.length;
                      })
                      .map((f) => {
                        const allVals = distinctValues[f.column] || [];
                        return {
                          column: f.column,
                          excludeValues: allVals.filter(
                            (v) => !f.allowedValues.includes(v),
                          ),
                        };
                      });
                    const config: PresetConfig["config"] = {
                      visibleColumns: Array.from(presetCols),
                      pivotRows: presetPivots,
                      valueOrdering: presetValueOrdering.filter(
                        (o) => o.values.length > 0,
                      ),
                      valueFilters,
                    };
                    try {
                      if (editingPreset?.id) {
                        await apiUpdatePreset(
                          editingPreset.id,
                          presetName,
                          config,
                        );
                      } else {
                        await createPreset(presetName, config);
                      }
                      await fetchPresets();
                      setPresetModalOpen(false);
                    } catch (err) {
                      alert(
                        err instanceof Error
                          ? err.message
                          : "Failed to save preset",
                      );
                    }
                  }}
                >
                  {editingPreset ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

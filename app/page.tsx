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
  listMappings,
  createMapping,
  deleteMapping,
  getMappingOptions,
  reprocessUpload,
  UploadStatus,
  ResultRow,
  PivotGroup as APIPivotGroup,
  SummaryResponse,
  ValidationError,
  Behaviour,
  ScenarioMapping,
  IRRBB_LABELS,
  LCR_LABELS,
  NSFR_LABELS,
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

/** Merge principal+interest maps from a ResultRow into a single value for a bucket label */
function getBucketValue(
  row: ResultRow,
  bucketType: "irrbb" | "lcr" | "nsfr",
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

function buildColumns(filterType: FilterType): ColDef[] {
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
        r.installment_frequency != null ? String(r.installment_frequency) : "-",
    },
    {
      key: "product_type",
      label: "Product Type",
      group: "Input",
      type: "input",
      getValue: (r) => r.product_type,
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
      getValue: (r) => r.transactional_or_non,
    },
    {
      key: "method",
      label: "Method",
      group: "Input",
      type: "input",
      getValue: (r) => r.method,
    },
    {
      key: "interest_payment_frequency",
      label: "Interest Pay Freq.",
      group: "Input",
      type: "input",
      getValue: (r) =>
        r.interest_payment_frequency != null
          ? String(r.interest_payment_frequency)
          : "-",
    },
    {
      key: "day_count",
      label: "Day Count",
      group: "Input",
      type: "input",
      getValue: (r) => r.day_count,
    },
    {
      key: "result_type",
      label: "Result Type",
      group: "Input",
      type: "input",
      getValue: (r) => r.result_type || "Normal",
    },
  ];

  const remDays: ColDef = {
    key: "remaining_days",
    label: "Rem. Days",
    group: "RemDays",
    type: "result",
    getValue: (r) => r.remaining_days,
  };

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

  return [...inputCols, remDays, ...lcrCols, ...nsfrCols, ...irrbbCols];
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
    { name: "RemDays", columns: ["remaining_days"] },
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
}: {
  data: ResultRow[];
  visibleColumns: Set<string>;
  allColumns: ColDef[];
  columnFilters: Record<string, ColumnFilterState>;
  onApplyFilter: (key: string, state: ColumnFilterState) => void;
  distinctValues: Record<string, string[]>;
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
/*  SCENARIO PANEL                                              */
/* ============================================================ */
function ScenarioPanel({
  uploadId,
  onReprocessed,
}: {
  uploadId: string;
  onReprocessed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [behaviours, setBehaviours] = useState<Behaviour[]>([]);
  const [mappings, setMappings] = useState<ScenarioMapping[]>([]);
  const [mappingOptions, setMappingOptions] = useState<{
    product_types: string[];
    ccys: string[];
    segments: string[];
    transactionals: string[];
  }>({ product_types: [], ccys: [], segments: [], transactionals: [] });

  // Behaviour upload form
  const [behaviourName, setBehaviourName] = useState("");
  const [behaviourFile, setBehaviourFile] = useState<File | null>(null);
  const behaviourFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  // Mapping form
  const [newMapping, setNewMapping] = useState({
    product_type: "",
    ccy: "",
    segment: "",
    transactional: "",
    behaviour_id: 0,
  });

  // Edit behaviour state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Reprocess state
  const [reprocessing, setReprocessing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [b, m, o] = await Promise.all([
        listBehaviours(uploadId),
        listMappings(uploadId),
        getMappingOptions(uploadId),
      ]);
      setBehaviours(b);
      setMappings(m);
      setMappingOptions(o);
    } catch {
      // ignore
    }
  }, [uploadId]);

  useEffect(() => {
    if (expanded) loadData();
  }, [expanded, loadData]);

  const handleUploadBehaviour = async () => {
    if (!behaviourFile || !behaviourName.trim()) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const result = await uploadBehaviour(
        uploadId,
        behaviourFile,
        behaviourName.trim(),
      );
      setUploadMsg(
        `✅ "${behaviourName}" saved with ${result.buckets} buckets`,
      );
      setBehaviourName("");
      setBehaviourFile(null);
      if (behaviourFileRef.current) behaviourFileRef.current.value = "";
      loadData();
    } catch (e: any) {
      setUploadMsg(`❌ ${e.message}`);
    }
    setUploading(false);
  };

  const handleDeleteBehaviour = async (id: number) => {
    if (
      !confirm("Delete this behaviour? Mappings using it will also be removed.")
    )
      return;
    try {
      await deleteBehaviour(id);
      loadData();
    } catch (e: any) {
      setUploadMsg(`❌ ${e.message}`);
    }
  };

  const handleStartEdit = (b: Behaviour) => {
    setEditingId(b.id);
    setEditName(b.name);
    setEditFile(null);
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    setEditSaving(true);
    try {
      await updateBehaviour(
        editingId,
        editName || undefined,
        editFile || undefined,
      );
      setUploadMsg(`✅ Behaviour updated`);
      setEditingId(null);
      loadData();
    } catch (e: any) {
      setUploadMsg(`❌ ${e.message}`);
    }
    setEditSaving(false);
  };

  const handleAddMapping = async () => {
    if (!newMapping.behaviour_id) return;
    try {
      await createMapping(uploadId, newMapping);
      setNewMapping({
        product_type: "",
        ccy: "",
        segment: "",
        transactional: "",
        behaviour_id: 0,
      });
      loadData();
    } catch (e: any) {
      setUploadMsg(`❌ ${e.message}`);
    }
  };

  const handleDeleteMapping = async (id: number) => {
    try {
      await deleteMapping(id);
      loadData();
    } catch {
      // ignore
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await reprocessUpload(uploadId);
      // Wait for processing to complete
      await waitForProcessing(uploadId);
      onReprocessed();
    } catch (e: any) {
      setUploadMsg(`❌ Reprocess failed: ${e.message}`);
    }
    setReprocessing(false);
  };

  const customBehaviours = behaviours.filter((b) => !b.is_default);
  const panelStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  };
  const headStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    cursor: "pointer",
    userSelect: "none",
  };
  const secStyle: React.CSSProperties = {
    padding: "16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  };
  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e2e8f0",
    fontSize: 13,
    outline: "none",
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    minWidth: 100,
    backgroundColor: "#1a1f3a",
    color: "#e2e8f0",
  };
  const btnPrimary: React.CSSProperties = {
    padding: "6px 14px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  };
  const btnDanger: React.CSSProperties = {
    padding: "4px 8px",
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    color: "#ef4444",
    cursor: "pointer",
    fontSize: 12,
  };
  const tagStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  };

  return (
    <div style={panelStyle}>
      <div style={headStyle} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          🎯 Scenario & Behaviour Engine
          {customBehaviours.length > 0 && (
            <span
              style={{
                ...tagStyle,
                background: "rgba(102,126,234,0.15)",
                color: "#667eea",
                marginLeft: 8,
              }}
            >
              {customBehaviours.length} custom
            </span>
          )}
          {mappings.length > 0 && (
            <span
              style={{
                ...tagStyle,
                background: "rgba(34,197,94,0.15)",
                color: "#22c55e",
                marginLeft: 4,
              }}
            >
              {mappings.length} mapping{mappings.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {expanded ? "▲ Collapse" : "▼ Expand"}
        </span>
      </div>

      {expanded && (
        <div>
          {/* Upload Behaviour CSV */}
          <div style={secStyle}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: "#94a3b8",
              }}
            >
              📂 Upload Custom Behaviour CSV
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                placeholder="Behaviour name (e.g. Covid Scenario)"
                value={behaviourName}
                onChange={(e) => setBehaviourName(e.target.value)}
                style={{ ...inputStyle, flex: "1 1 200px", minWidth: 180 }}
              />
              <input
                ref={behaviourFileRef}
                type="file"
                accept=".csv,.txt"
                onChange={(e) => setBehaviourFile(e.target.files?.[0] || null)}
                style={{ fontSize: 12, color: "#a0aec0" }}
              />
              <button
                onClick={handleUploadBehaviour}
                disabled={!behaviourFile || !behaviourName.trim() || uploading}
                style={{
                  ...btnPrimary,
                  opacity:
                    !behaviourFile || !behaviourName.trim() || uploading
                      ? 0.5
                      : 1,
                }}
              >
                {uploading ? "⏳ Uploading..." : "⬆ Upload"}
              </button>
            </div>
            {uploadMsg && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: uploadMsg.startsWith("✅") ? "#22c55e" : "#f87171",
                }}
              >
                {uploadMsg}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
              CSV format:{" "}
              <code style={{ color: "#a0aec0" }}>
                Bucket Type, Bucket Name, Percentage
              </code>
            </div>
          </div>

          {/* Saved Behaviours */}
          <div style={secStyle}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: "#94a3b8",
              }}
            >
              📋 Saved Behaviours
            </div>
            {behaviours.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                No behaviours loaded yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {behaviours.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    {editingId === b.id ? (
                      /* EDIT MODE */
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{
                              ...inputStyle,
                              flex: "1 1 160px",
                              minWidth: 140,
                            }}
                            placeholder="Behaviour name"
                          />
                          <input
                            ref={editFileRef}
                            type="file"
                            accept=".csv,.txt"
                            onChange={(e) =>
                              setEditFile(e.target.files?.[0] || null)
                            }
                            style={{
                              fontSize: 12,
                              color: "#a0aec0",
                              flex: "0 0 auto",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            onClick={() => setEditingId(null)}
                            style={{
                              padding: "4px 10px",
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 6,
                              color: "#a0aec0",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={editSaving}
                            style={{
                              ...btnPrimary,
                              padding: "4px 10px",
                              fontSize: 12,
                              opacity: editSaving ? 0.5 : 1,
                            }}
                          >
                            {editSaving ? "Saving..." : "💾 Save"}
                          </button>
                        </div>
                        {editFile && (
                          <div style={{ fontSize: 11, color: "#667eea" }}>
                            New file: {editFile.name} (will replace current
                            weights)
                          </div>
                        )}
                      </div>
                    ) : (
                      /* VIEW MODE */
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{b.name}</span>
                          {b.is_default && (
                            <span
                              style={{
                                ...tagStyle,
                                background: "rgba(250,204,21,0.15)",
                                color: "#facc15",
                              }}
                            >
                              Default
                            </span>
                          )}
                        </div>
                        {!b.is_default && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              onClick={() => handleStartEdit(b)}
                              style={{
                                padding: "4px 8px",
                                background: "rgba(102,126,234,0.12)",
                                border: "1px solid rgba(102,126,234,0.3)",
                                borderRadius: 6,
                                color: "#667eea",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              ✎ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteBehaviour(b.id)}
                              style={btnDanger}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scenario Mappings */}
          <div style={secStyle}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: "#94a3b8",
              }}
            >
              🔗 Scenario Mappings
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
              Map loan criteria (ProductType + CCY + Segment + Transactional) →
              Custom Behaviour
            </div>

            {/* Existing mappings */}
            {mappings.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          padding: "4px 8px",
                          textAlign: "left",
                          color: "#64748b",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        Product Type
                      </th>
                      <th
                        style={{
                          padding: "4px 8px",
                          textAlign: "left",
                          color: "#64748b",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        CCY
                      </th>
                      <th
                        style={{
                          padding: "4px 8px",
                          textAlign: "left",
                          color: "#64748b",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        Segment
                      </th>
                      <th
                        style={{
                          padding: "4px 8px",
                          textAlign: "left",
                          color: "#64748b",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        Transactional
                      </th>
                      <th
                        style={{
                          padding: "4px 8px",
                          textAlign: "left",
                          color: "#64748b",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        → Behaviour
                      </th>
                      <th
                        style={{
                          padding: "4px 8px",
                          textAlign: "right",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      ></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => (
                      <tr key={m.id}>
                        <td style={{ padding: "4px 8px", color: "#e2e8f0" }}>
                          {m.product_type}
                        </td>
                        <td style={{ padding: "4px 8px", color: "#e2e8f0" }}>
                          {m.ccy}
                        </td>
                        <td style={{ padding: "4px 8px", color: "#e2e8f0" }}>
                          {m.segment}
                        </td>
                        <td style={{ padding: "4px 8px", color: "#e2e8f0" }}>
                          {m.transactional}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            color: "#667eea",
                            fontWeight: 600,
                          }}
                        >
                          {m.behaviour_name}
                        </td>
                        <td style={{ padding: "4px 8px", textAlign: "right" }}>
                          <button
                            onClick={() => handleDeleteMapping(m.id)}
                            style={btnDanger}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add mapping form */}
            {customBehaviours.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={newMapping.product_type}
                  onChange={(e) =>
                    setNewMapping((p) => ({
                      ...p,
                      product_type: e.target.value,
                    }))
                  }
                  style={selectStyle}
                >
                  <option value="">ProductType</option>
                  {mappingOptions.product_types.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={newMapping.ccy}
                  onChange={(e) =>
                    setNewMapping((p) => ({ ...p, ccy: e.target.value }))
                  }
                  style={selectStyle}
                >
                  <option value="">CCY</option>
                  {mappingOptions.ccys.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={newMapping.segment}
                  onChange={(e) =>
                    setNewMapping((p) => ({ ...p, segment: e.target.value }))
                  }
                  style={selectStyle}
                >
                  <option value="">Segment</option>
                  {mappingOptions.segments.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={newMapping.transactional}
                  onChange={(e) =>
                    setNewMapping((p) => ({
                      ...p,
                      transactional: e.target.value,
                    }))
                  }
                  style={selectStyle}
                >
                  <option value="">Transactional</option>
                  {mappingOptions.transactionals.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <span style={{ color: "#64748b", fontSize: 12 }}>→</span>
                <select
                  value={newMapping.behaviour_id}
                  onChange={(e) =>
                    setNewMapping((p) => ({
                      ...p,
                      behaviour_id: parseInt(e.target.value) || 0,
                    }))
                  }
                  style={{ ...selectStyle, minWidth: 140 }}
                >
                  <option value={0}>Select Behaviour</option>
                  {customBehaviours.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddMapping}
                  disabled={!newMapping.behaviour_id}
                  style={{
                    ...btnPrimary,
                    opacity: !newMapping.behaviour_id ? 0.5 : 1,
                  }}
                >
                  + Add
                </button>
              </div>
            )}
            {customBehaviours.length === 0 && (
              <div
                style={{ color: "#64748b", fontSize: 12, fontStyle: "italic" }}
              >
                Upload a custom behaviour first to create mappings
              </div>
            )}
          </div>

          {/* Reprocess */}
          {(customBehaviours.length > 0 || mappings.length > 0) && (
            <div
              style={{
                ...secStyle,
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ color: "#64748b", fontSize: 12 }}>
                After adding behaviours/mappings, reprocess to generate new
                results
              </span>
              <button
                onClick={handleReprocess}
                disabled={reprocessing}
                style={{
                  ...btnPrimary,
                  padding: "8px 18px",
                  background: reprocessing
                    ? "#444"
                    : "linear-gradient(135deg, #22c55e, #15803d)",
                }}
              >
                {reprocessing ? "⏳ Reprocessing..." : "🔄 Reprocess"}
              </button>
            </div>
          )}
        </div>
      )}
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
  const [resultTypeFilter, setResultTypeFilter] = useState<string>("all");
  const [availableResultTypes, setAvailableResultTypes] = useState<string[]>(
    [],
  );

  // Column visibility
  const allColumns = useMemo(() => buildColumns(filterType), [filterType]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(buildColumns("both").map((c) => c.key)),
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
  // Check auth on mount + handle ?upload_id= from history page
  useEffect(() => {
    const loggedIn = isLoggedIn();
    setAuthenticated(loggedIn);
    setAuthChecked(true);

    if (loggedIn) {
      const params = new URLSearchParams(window.location.search);
      const existingUploadId = params.get("upload_id");
      if (existingUploadId) {
        // Remove from URL to keep it clean
        window.history.replaceState({}, "", "/");
        // Load results from existing upload
        setUploadId(existingUploadId);
        setProcessing(true);
        setProcessProgress("Loading results...");
        getResults(existingUploadId, {
          page: 1,
          limit: 20,
          filter_type: filterType,
        })
          .then((pageData) => {
            setResults(pageData.data || []);
            setTotalRows(pageData.total);
            setCurrentPage(1);
            setTotalPages(pageData.total_pages);
            setProcessed(true);
            setProcessing(false);
            setProcessProgress("");
          })
          .catch((err) => {
            setError((err as Error).message);
            setProcessing(false);
            setProcessProgress("");
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Fetch summary when uploadId or filterType changes
  useEffect(() => {
    if (!uploadId || !processed) return;
    getSummary(uploadId, filterType)
      .then(setSummary)
      .catch(() => {});
  }, [uploadId, filterType, processed]);

  // Fetch available result types when processed
  useEffect(() => {
    if (!uploadId || !processed) return;
    getFilterOptions(uploadId, "result_type")
      .then((types) => {
        setAvailableResultTypes(types);
      })
      .catch(() => {});
  }, [uploadId, processed]);

  // Fetch pivot data when pivotRows change
  useEffect(() => {
    if (!uploadId || !processed || pivotRows.length === 0) return;
    setLoadingPivot(true);
    getPivot(uploadId, pivotRows, filterType)
      .then((data) => {
        setPivotData(data);
        setLoadingPivot(false);
      })
      .catch(() => setLoadingPivot(false));
  }, [uploadId, processed, pivotRows, filterType]);

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
      const pageData = await getResults(uploadRes.id, {
        page: 1,
        limit: 20,
        filter_type: filterType,
      });

      setResults(pageData.data || []);
      setTotalRows(pageData.total);
      setCurrentPage(1);
      setTotalPages(pageData.total_pages);
      setProcessed(true);
      setProcessing(false);
      setProcessProgress("");
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

    // Apply result type filter
    if (resultTypeFilter !== "all") {
      data = data.filter(
        (row) => (row.result_type || "Normal") === resultTypeFilter,
      );
    }

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
  }, [results, columnFilters, allColumns, resultTypeFilter]);

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
      await downloadExport(uploadId, filterType);
    } catch (err) {
      setError((err as Error).message);
    }
    setExporting(false);
  }, [uploadId, filterType]);

  const filterLabel: Record<FilterType, string> = {
    bbi: "Installment Cashflow BBI",
    interest: "Installment Interest",
    both: "Combined (BBI + Interest)",
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

        {/* SCENARIO PANEL */}
        {processed && uploadId && (
          <ScenarioPanel
            uploadId={uploadId}
            onReprocessed={() => {
              // Reload results after reprocess
              getResults(uploadId, {
                page: 1,
                limit: 20,
                filter_type: filterType,
              }).then((pageData) => {
                setResults(pageData.data || []);
                setTotalRows(pageData.total);
                setCurrentPage(1);
                setTotalPages(pageData.total_pages);
                // Clear distinct values cache so it reloads
                setDistinctValues({});
              });
              getSummary(uploadId, filterType)
                .then(setSummary)
                .catch(() => {});
              // Reload result types
              getFilterOptions(uploadId, "result_type")
                .then(setAvailableResultTypes)
                .catch(() => {});
            }}
          />
        )}

        {/* RESULT TYPE TABS */}
        {processed && availableResultTypes.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 0,
              marginBottom: 12,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setResultTypeFilter("all")}
              style={{
                padding: "8px 16px",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 0.2s",
                background:
                  resultTypeFilter === "all"
                    ? "linear-gradient(135deg, #667eea, #764ba2)"
                    : "transparent",
                color: resultTypeFilter === "all" ? "#fff" : "#94a3b8",
              }}
            >
              All Results
            </button>
            {availableResultTypes.map((rt) => (
              <button
                key={rt}
                onClick={() => setResultTypeFilter(rt)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.2s",
                  borderLeft: "1px solid rgba(255,255,255,0.06)",
                  background:
                    resultTypeFilter === rt
                      ? "linear-gradient(135deg, #667eea, #764ba2)"
                      : "transparent",
                  color: resultTypeFilter === rt ? "#fff" : "#94a3b8",
                }}
              >
                {rt}
              </button>
            ))}
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
                Cashflow BBI
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
                Both (Sum)
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
                    ? "BBI + Interest"
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
              Upload a CSV/TXT file with your loan data, then click{" "}
              <strong>&quot;Process Cashflow&quot;</strong> to see the results.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

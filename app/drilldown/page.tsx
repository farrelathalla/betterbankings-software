"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  isLoggedIn,
  getResults,
  downloadExport,
  ResultRow,
  IRRBB_LABELS,
  LCR_LABELS,
  NSFR_LABELS,
  Behaviour,
  listBehaviours,
  uploadBehaviour,
  updateBehaviour,
  deleteBehaviour,
  reprocessUpload,
} from "../lib/api";

/* ============================================================ */
/*  TYPES                                                       */
/* ============================================================ */
type FilterType = "bbi" | "interest" | "both";

interface ColDef {
  key: string;
  label: string;
  group: string;
  getValue: (row: ResultRow) => string | number;
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
      getValue: (r) => r.reporting_date,
    },
    {
      key: "account_id",
      label: "Account ID",
      group: "Input",
      getValue: (r) => r.account_id,
    },
    { key: "ccy", label: "CCY", group: "Input", getValue: (r) => r.ccy },
    {
      key: "outstanding",
      label: "Outstanding",
      group: "Input",
      getValue: (r) => r.outstanding,
    },
    {
      key: "interest_rate",
      label: "Interest Rate",
      group: "Input",
      getValue: (r) => r.interest_rate,
    },
    {
      key: "start_date",
      label: "Start Date",
      group: "Input",
      getValue: (r) => r.start_date,
    },
    {
      key: "end_date",
      label: "End Date",
      group: "Input",
      getValue: (r) => r.end_date,
    },
    {
      key: "installment_frequency",
      label: "Installment Freq.",
      group: "Input",
      getValue: (r) =>
        r.installment_frequency != null ? String(r.installment_frequency) : "-",
    },
    {
      key: "product_type",
      label: "Product Type",
      group: "Input",
      getValue: (r) => r.product_type,
    },
    {
      key: "segment",
      label: "Segment",
      group: "Input",
      getValue: (r) => r.segment,
    },
    {
      key: "daerah",
      label: "Daerah",
      group: "Input",
      getValue: (r) => r.daerah,
    },
    {
      key: "kode_pos",
      label: "KodePos",
      group: "Input",
      getValue: (r) => r.kode_pos,
    },
    {
      key: "insured_or_uninsured",
      label: "Insured/Uninsured",
      group: "Input",
      getValue: (r) => r.insured_or_uninsured,
    },
    {
      key: "transactional_or_non",
      label: "Transactional/Non",
      group: "Input",
      getValue: (r) => r.transactional_or_non,
    },
    {
      key: "method",
      label: "Method",
      group: "Input",
      getValue: (r) => r.method,
    },
    {
      key: "interest_payment_frequency",
      label: "Interest Pay Freq.",
      group: "Input",
      getValue: (r) =>
        r.interest_payment_frequency != null
          ? String(r.interest_payment_frequency)
          : "-",
    },
    {
      key: "day_count",
      label: "Day Count",
      group: "Input",
      getValue: (r) => r.day_count,
    },
  ];

  const remDays: ColDef = {
    key: "remaining_days",
    label: "Rem. Days",
    group: "RemDays",
    getValue: (r) => r.remaining_days,
  };

  const lcrCols: ColDef[] = LCR_LABELS.map((label) => ({
    key: `lcr__${label}`,
    label,
    group: "CF LCR",
    getValue: (r: ResultRow) => getBucketValue(r, "lcr", label, filterType),
  }));

  const nsfrCols: ColDef[] = NSFR_LABELS.map((label) => ({
    key: `nsfr__${label}`,
    label,
    group: "CF NSFR",
    getValue: (r: ResultRow) => getBucketValue(r, "nsfr", label, filterType),
  }));

  const irrbbCols: ColDef[] = IRRBB_LABELS.map((label) => ({
    key: `irrbb__${label}`,
    label,
    group: "CF IRRBB",
    getValue: (r: ResultRow) => getBucketValue(r, "irrbb", label, filterType),
  }));

  return [...inputCols, remDays, ...lcrCols, ...nsfrCols, ...irrbbCols];
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
/*  COLUMN FILTER STATE                                         */
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
/*  FILTER DROPDOWN                                             */
/* ============================================================ */
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
/*  FILTERABLE HEADER                                           */
/* ============================================================ */
function FilterableHeader({
  col,
  className,
  data,
  columnFilters,
  onApplyFilter,
}: {
  col: ColDef;
  className: string;
  data: ResultRow[];
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
  const isNum = isNumericKey(col.key);

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
function DrilldownContent() {
  const searchParams = useSearchParams();
  const uploadId = searchParams.get("upload_id") || "";
  const filterType = (searchParams.get("filter_type") || "both") as FilterType;
  const filtersRaw = searchParams.get("filters") || "{}";
  const columnsRaw = searchParams.get("columns") || "[]";

  const filters: Record<string, string> = useMemo(() => {
    try {
      return JSON.parse(filtersRaw);
    } catch {
      return {};
    }
  }, [filtersRaw]);

  const visibleKeys: Set<string> = useMemo(() => {
    try {
      const arr = JSON.parse(columnsRaw);
      return new Set(arr as string[]);
    } catch {
      return new Set(buildColumns("both").map((c) => c.key));
    }
  }, [columnsRaw]);

  const allColumns = useMemo(() => buildColumns(filterType), [filterType]);

  const [data, setData] = useState<ResultRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilterState>
  >({});

  const [scenarios, setScenarios] = useState<Behaviour[]>([]);
  const [activeBehaviourId, setActiveBehaviourId] = useState<number | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);

  // Fetch Scenarios
  const fetchScenarios = useCallback(async () => {
    if (!uploadId) return;
    try {
      const list = await listBehaviours(uploadId);
      setScenarios(list);
    } catch {
      // ignore
    }
  }, [uploadId]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  // Load data from API
  const loadData = useCallback(async () => {
    if (!uploadId || !isLoggedIn()) {
      setLoaded(true);
      return;
    }
    try {
      const apiFilters: Record<string, string> = { ...filters };
      const pageData = await getResults(uploadId, {
        page: 1,
        limit: 20,
        filter_type: filterType,
        filters: apiFilters,
        behaviour_id: activeBehaviourId,
      });

      setData(pageData.data || []);
      setTotalRows(pageData.total);
      setCurrentPage(1);
      setTotalPages(pageData.total_pages);
    } catch {
      // ignore
    }
    setLoaded(true);
  }, [uploadId, filterType, filters, activeBehaviourId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLoadMore = useCallback(async () => {
    if (!uploadId || loadingMore || currentPage >= totalPages) return;
    setLoadingMore(true);
    try {
      const apiFilters: Record<string, string> = {};
      for (const [key, val] of Object.entries(filters)) {
        apiFilters[key] = val;
      }
      const nextPage = currentPage + 1;
      const pageData = await getResults(uploadId, {
        page: nextPage,
        limit: 20,
        filter_type: filterType,
        filters: apiFilters,
        behaviour_id: activeBehaviourId,
      });
      setData((prev) => [...prev, ...(pageData.data || [])]);
      setCurrentPage(nextPage);
    } catch {
      // ignore
    }
    setLoadingMore(false);
  }, [uploadId, currentPage, totalPages, loadingMore, filterType, filters]);

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

  const visibleCols = useMemo(
    () => allColumns.filter((c) => visibleKeys.has(c.key)),
    [allColumns, visibleKeys],
  );

  // Apply client-side column filters
  const filteredData = useMemo(() => {
    let result = [...data];

    for (const [key, fs] of Object.entries(columnFilters)) {
      const col = allColumns.find((c) => c.key === key);
      if (!col) continue;

      if (fs.selectedValues.size > 0) {
        result = result.filter((row) =>
          fs.selectedValues.has(String(col.getValue(row))),
        );
      }

      if (isNumericKey(key)) {
        if (fs.numberMin !== "") {
          const min = parseFloat(fs.numberMin);
          if (!isNaN(min))
            result = result.filter(
              (row) => (col.getValue(row) as number) >= min,
            );
        }
        if (fs.numberMax !== "") {
          const max = parseFloat(fs.numberMax);
          if (!isNaN(max))
            result = result.filter(
              (row) => (col.getValue(row) as number) <= max,
            );
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
        result.sort((a, b) => {
          const va = sortCol.getValue(a);
          const vb = sortCol.getValue(b);
          if (typeof va === "number" && typeof vb === "number")
            return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
    }

    return result;
  }, [data, columnFilters, allColumns]);

  const activeFilterCount = Object.keys(columnFilters).length;

  // Export
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (!uploadId) return;
    setExporting(true);
    try {
      await downloadExport(uploadId, filterType, filters, activeBehaviourId);
    } catch {
      /* ignore */
    }
    setExporting(false);
  }, [uploadId, filterType, filters, activeBehaviourId]);

  // Scenario Handlers
  const handleAddScenario = async () => {
    const name = prompt("Enter Scenario Name:");
    if (!name) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setRefreshing(true);
        const res = await uploadBehaviour(uploadId, file, name);
        await reprocessUpload(uploadId); // Trigger reprocess for all
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
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setRefreshing(true);
        await updateBehaviour(id, undefined, file);
        await reprocessUpload(uploadId);
        alert("Scenario file updated and reprocessed.");
        loadData();
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
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "⏳ Exporting..." : "📥 Export Excel"}
          </button>
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
            const col = allColumns.find((c) => c.key === key);
            return (
              <span key={key} className="drilldown-badge">
                {col?.label || key} = <strong>{val}</strong>
              </span>
            );
          })}
        </div>

        {/* Tab Bar */}
        <div className="scenario-tabs-container">
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
        </div>

        {refreshing && (
          <div
            style={{ padding: "0.5rem", color: "#2563eb", fontWeight: "bold" }}
          >
            ⌛ Processing changes...
          </div>
        )}

        <div className="stats-bar fade-in" style={{ marginBottom: "1.5rem" }}>
          <div className="stat-card">
            <div className="stat-label">Total Matching</div>
            <div className="stat-value">{totalRows}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Loaded</div>
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
                    <tr key={row.row_number || idx}>
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
                              ? col.key === "interest_rate"
                                ? fmtPct(val)
                                : col.key === "remaining_days"
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
            {currentPage < totalPages && (
              <div className="load-more-container">
                <button
                  className="btn-load-more"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? "Loading..."
                    : `Load More (${data.length} of ${totalRows})`}
                </button>
              </div>
            )}
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

// Wrap in Suspense boundary for useSearchParams
import { Suspense } from "react";

export default function DrilldownPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-fullscreen">
          <div className="loading-spinner" />
        </div>
      }
    >
      <DrilldownContent />
    </Suspense>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  isLoggedIn,
  isSuperAdmin,
  getUsername,
  logout,
  listReference,
  createReference,
  updateReference,
  deleteReference,
  getMasterDataSchema,
  downloadTemplate,
  ReferenceItem,
  MasterDataSchema,
  MasterDataColumn,
} from "../lib/api";
import { useModal } from "../components/Modal";

type View = "data" | "guide";

export default function AdminPage() {
  const router = useRouter();
  const { showConfirm, showError, showSuccess } = useModal();

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("data");
  const [schema, setSchema] = useState<MasterDataSchema | null>(null);
  const [schemaError, setSchemaError] = useState("");

  const [activeTable, setActiveTable] = useState("");
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Add/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!isLoggedIn() || !isSuperAdmin()) {
      router.push("/");
      return;
    }
    setLoading(false);
  }, [router]);

  const loadSchema = useCallback(async () => {
    try {
      const s = await getMasterDataSchema();
      setSchema(s);
      setSchemaError("");
      setActiveTable((prev) => prev || s.tables[0]?.key || "");
    } catch (e) {
      setSchemaError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadSchema();
  }, [loading, loadSchema]);

  const loadItems = useCallback(async () => {
    if (!activeTable) return;
    setTableLoading(true);
    try {
      setItems(await listReference(activeTable));
    } catch (e) {
      showError("Could not load this table", (e as Error).message);
    }
    setTableLoading(false);
  }, [activeTable, showError]);

  useEffect(() => {
    if (!loading && activeTable) loadItems();
  }, [loading, activeTable, loadItems]);

  const activeMeta = useMemo(
    () => schema?.tables.find((t) => t.key === activeTable),
    [schema, activeTable],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
    );
  }, [items, search]);

  const handleAdd = () => {
    setEditId(null);
    setFormId("");
    setFormName("");
    setFormError("");
    setShowForm(true);
  };

  const handleEdit = (item: ReferenceItem) => {
    setEditId(item.id);
    setFormId(item.id);
    setFormName(item.name);
    setFormError("");
    setShowForm(true);
  };

  const handleDelete = async (item: ReferenceItem) => {
    const ok = await showConfirm({
      title: `Delete "${item.id} = ${item.name}"?`,
      message:
        `Uploads will stop accepting ${item.id} in the ` +
        `${activeMeta?.label || activeTable} column. Rename the entry instead ` +
        `if the code is still in use.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deleteReference(activeTable, item.id);
      await loadItems();
      await loadSchema();
    } catch (e) {
      showError("Could not delete this entry", (e as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const id = formId.trim();
    const name = formName.trim();
    if (!id) return setFormError("Code is required.");
    if (!name) return setFormError("Meaning is required.");
    if (!editId && items.some((i) => i.id === id)) {
      return setFormError(
        `Code "${id}" already exists in this table — every code must be unique.`,
      );
    }

    try {
      if (editId) {
        await updateReference(activeTable, editId, { id, name });
      } else {
        await createReference(activeTable, { id, name });
      }
      setShowForm(false);
      await loadItems();
      await loadSchema();
      showSuccess(
        editId ? "Entry updated" : "Entry added",
        `${id} = ${name} is now part of ${activeMeta?.label || activeTable}.`,
      );
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadTemplate();
    } catch (e) {
      showError("Could not build the template", (e as Error).message);
    }
    setDownloading(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1 className="admin-brand">⚙ Master Data</h1>
          <button className="admin-link-btn" onClick={() => router.push("/")}>
            ← Back to Calculator
          </button>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">👤 {getUsername()}</span>
          <button className="admin-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-body">
        <div className="admin-intro">
          <div>
            <h2>Codes that every upload is checked against</h2>
            <p>
              The upload file carries <b>codes</b>, not words — a Product Type
              cell holds <code>1</code>, not <code>Loan</code>. This page is
              where those codes are defined. A file containing a code that is
              not listed here is rejected before anything is imported, with the
              offending row and column named.
            </p>
          </div>
          <button
            className="admin-template-btn"
            onClick={handleDownloadTemplate}
            disabled={downloading}
          >
            {downloading ? "Building…" : "⬇ Download Excel template"}
          </button>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${view === "data" ? "active" : ""}`}
            onClick={() => setView("data")}
          >
            Master Data Tables
          </button>
          <button
            className={`admin-tab ${view === "guide" ? "active" : ""}`}
            onClick={() => setView("guide")}
          >
            How to build the Excel
          </button>
        </div>

        {schemaError && <div className="admin-error">{schemaError}</div>}

        {view === "data" ? (
          <div className="admin-split">
            <nav className="admin-sidebar">
              {schema?.tables.map((t) => (
                <button
                  key={t.key}
                  className={`admin-side-item ${
                    activeTable === t.key ? "active" : ""
                  }`}
                  onClick={() => {
                    setActiveTable(t.key);
                    setSearch("");
                  }}
                >
                  <span className="admin-side-label">{t.label}</span>
                  <span className="admin-side-count">{t.items.length}</span>
                </button>
              ))}
            </nav>

            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <h3>{activeMeta?.label || activeTable}</h3>
                  <p>{activeMeta?.description}</p>
                  {activeMeta && activeMeta.used_by.length > 0 && (
                    <p className="admin-used-by">
                      Read from column
                      {activeMeta.used_by.length > 1 ? "s" : ""}:{" "}
                      {activeMeta.used_by.map((c) => (
                        <code key={c}>{c}</code>
                      ))}
                    </p>
                  )}
                </div>
                <button className="admin-primary-btn" onClick={handleAdd}>
                  + Add code
                </button>
              </div>

              <input
                className="admin-search"
                placeholder="Search code or meaning…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {tableLoading ? (
                <div className="admin-empty">Loading…</div>
              ) : filteredItems.length === 0 ? (
                <div className="admin-empty">
                  {items.length === 0
                    ? "No codes yet — uploads cannot validate this column until you add some."
                    : "No code matches your search."}
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Code in Excel</th>
                      <th>Meaning shown in the app</th>
                      <th style={{ width: 150 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="admin-code">{item.id}</span>
                        </td>
                        <td className="admin-name">{item.name}</td>
                        <td className="admin-row-actions">
                          <button onClick={() => handleEdit(item)}>Edit</button>
                          <button
                            className="danger"
                            onClick={() => handleDelete(item)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        ) : (
          <UploadGuide schema={schema} />
        )}
      </div>

      {showForm && (
        <div className="bb-modal-overlay" onMouseDown={() => setShowForm(false)}>
          <div
            className="bb-modal bb-modal-info"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="bb-modal-head">
              <span className="bb-modal-icon">{editId ? "✏️" : "➕"}</span>
              <div>
                <h3 className="bb-modal-title">
                  {editId ? "Edit code" : "Add code"} ·{" "}
                  {activeMeta?.label || activeTable}
                </h3>
                <p className="bb-modal-subtitle">
                  The code is what people type into the Excel file. The meaning
                  is what the app shows instead of it.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="admin-field">
                <span>Code in Excel</span>
                <input
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  disabled={!!editId}
                  placeholder="e.g. 5"
                  autoFocus={!editId}
                />
                {editId && (
                  <small>
                    A code cannot be renamed — delete it and add a new one if it
                    is wrong.
                  </small>
                )}
              </label>

              <label className="admin-field">
                <span>Meaning</span>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Time Deposit"
                  autoFocus={!!editId}
                />
              </label>

              {formError && <div className="admin-form-error">{formError}</div>}

              <div className="bb-modal-actions">
                <button
                  type="button"
                  className="bb-modal-btn bb-modal-btn-ghost"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="bb-modal-btn bb-modal-btn-info">
                  {editId ? "Save" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/*  UPLOAD GUIDE — "what number means what"                     */
/* ============================================================ */

function UploadGuide({ schema }: { schema: MasterDataSchema | null }) {
  const [query, setQuery] = useState("");

  const columns = useMemo(() => {
    if (!schema) return [];
    const q = query.trim().toLowerCase();
    if (!q) return schema.columns;
    return schema.columns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.allowed_values.some(
          (v) =>
            v.id.toLowerCase().includes(q) || v.name.toLowerCase().includes(q),
        ),
    );
  }, [schema, query]);

  if (!schema) return <div className="admin-empty">Loading the guide…</div>;

  const required = schema.columns.filter((c) => c.required).length;

  return (
    <div className="guide">
      <div className="guide-steps">
        <div className="guide-step">
          <span className="guide-step-num">1</span>
          <div>
            <b>Start from the template</b>
            <p>
              Download it above. Row 1 holds the exact headers, row 2 explains
              each column, row 3 is a filled example you can delete. Coded
              columns already carry a dropdown of valid codes, and a second
              sheet lists every code with its meaning.
            </p>
          </div>
        </div>
        <div className="guide-step">
          <span className="guide-step-num">2</span>
          <div>
            <b>Write codes, not words</b>
            <p>
              Coded columns take the number from the tables below — Product Type{" "}
              <code>1</code> rather than <code>Loan</code>. The full name is
              accepted too, but the number is what the rest of the bank uses.
            </p>
          </div>
        </div>
        <div className="guide-step">
          <span className="guide-step-num">3</span>
          <div>
            <b>Upload and read the errors</b>
            <p>
              {required} column{required === 1 ? " is" : "s are"} mandatory.
              Anything outside these lists is reported row by row and nothing is
              imported, so a rejected file never leaves half-loaded data behind.
            </p>
          </div>
        </div>
      </div>

      <input
        className="admin-search guide-search"
        placeholder="Search a column, a code, or a meaning…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="guide-list">
        {columns.map((col) => (
          <GuideColumn key={col.name} col={col} />
        ))}
        {columns.length === 0 && (
          <div className="admin-empty">Nothing matches “{query}”.</div>
        )}
      </div>

      <p className="guide-footnote">
        Calculation engine limits — Method must resolve to{" "}
        {schema.supported_methods.join(" or ")}; Day Count must resolve to{" "}
        {schema.supported_day_counts.join(", ")}. Codes outside those are
        rejected at upload even if they exist in the master data.
      </p>
    </div>
  );
}

function GuideColumn({ col }: { col: MasterDataColumn }) {
  return (
    <div className={`guide-col ${col.required ? "required" : ""}`}>
      <div className="guide-col-head">
        <code className="guide-col-name">{col.name}</code>
        <span className={`guide-badge ${col.required ? "req" : "opt"}`}>
          {col.required ? "Required" : "Optional"}
        </span>
        {col.nullable && col.required && (
          <span className="guide-badge blank">May be left blank</span>
        )}
        <span className="guide-format">{col.format}</span>
      </div>

      <p className="guide-col-desc">{col.description}</p>

      {col.allowed_values.length > 0 ? (
        <div className="guide-codes">
          {col.allowed_values.map((v) => (
            <span key={v.id} className="guide-code">
              <b>{v.id}</b>
              {v.name}
            </span>
          ))}
        </div>
      ) : (
        <div className="guide-example">
          Example: <code>{col.example || "—"}</code>
        </div>
      )}

      {col.aliases && col.aliases.length > 0 && (
        <div className="guide-aliases">
          Header also accepted as:{" "}
          {col.aliases.map((a) => (
            <code key={a}>{a}</code>
          ))}
        </div>
      )}
    </div>
  );
}

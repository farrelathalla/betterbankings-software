"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  ReferenceItem,
} from "../lib/api";

const TABLES = [
  { key: "product_types", label: "Product Types" },
  { key: "segments", label: "Segments" },
  { key: "methods", label: "Methods" },
  { key: "day_counts", label: "Day Counts" },
  { key: "currencies", label: "Currencies" },
  { key: "instrument_types", label: "Instrument Types" },
  { key: "transactional_types", label: "Transactional Types" },
  { key: "installment_frequencies", label: "Installment Frequencies" },
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(TABLES[0].key);
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

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

  const loadItems = useCallback(async () => {
    setTableLoading(true);
    setError("");
    try {
      const data = await listReference(activeTab);
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    }
    setTableLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (!loading) loadItems();
  }, [loading, loadItems]);

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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteReference(activeTab, id);
      loadItems();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      if (editId) {
        await updateReference(activeTab, editId, {
          id: formId,
          name: formName,
        });
      } else {
        await createReference(activeTab, { id: formId, name: formName });
      }
      setShowForm(false);
      loadItems();
    } catch (e: any) {
      setFormError(e.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "#0a0e1a",
        }}
      >
        <div style={{ color: "#a0aec0", fontSize: 18 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0e1a 0%, #1a1f3a 100%)",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          background: "rgba(10,14,26,0.8)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              background: "linear-gradient(135deg, #667eea, #764ba2)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            ⚙ Admin Panel
          </h1>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "6px 14px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "#a0aec0",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back to Calculator
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#a0aec0", fontSize: 14 }}>
            👤 {getUsername()}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: "6px 14px",
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              color: "#ef4444",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <h2 style={{ fontSize: 18, marginBottom: 20, fontWeight: 600 }}>
          Reference Table Management
        </h2>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {TABLES.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid",
                borderColor:
                  activeTab === t.key
                    ? "rgba(102,126,234,0.5)"
                    : "rgba(255,255,255,0.1)",
                background:
                  activeTab === t.key
                    ? "rgba(102,126,234,0.15)"
                    : "rgba(255,255,255,0.04)",
                color: activeTab === t.key ? "#667eea" : "#a0aec0",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.2s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "10px 16px",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              color: "#f87171",
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Table */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {TABLES.find((t) => t.key === activeTab)?.label} ({items.length})
            </span>
            <button
              onClick={handleAdd}
              style={{
                padding: "6px 14px",
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Add New
            </button>
          </div>

          {tableLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#a0aec0" }}>
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
              No items yet
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      color: "#94a3b8",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    ID
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      color: "#94a3b8",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "right",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      color: "#94a3b8",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <td
                      style={{
                        padding: "10px 16px",
                        fontSize: 14,
                        fontFamily: "monospace",
                        color: "#667eea",
                      }}
                    >
                      {item.id}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>
                      {item.name}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => handleEdit(item)}
                        style={{
                          padding: "4px 10px",
                          background: "rgba(102,126,234,0.12)",
                          border: "1px solid rgba(102,126,234,0.3)",
                          borderRadius: 6,
                          color: "#667eea",
                          cursor: "pointer",
                          fontSize: 12,
                          marginRight: 6,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{
                          padding: "4px 10px",
                          background: "rgba(239,68,68,0.12)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          borderRadius: 6,
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showForm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 200,
            }}
            onClick={() => setShowForm(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "linear-gradient(135deg, #1a1f3a, #0f1424)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 16,
                padding: 28,
                width: 380,
                boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                {editId ? "Edit Item" : "Add New Item"}
              </h3>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#94a3b8",
                      marginBottom: 4,
                      fontWeight: 500,
                    }}
                  >
                    ID
                  </label>
                  <input
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    disabled={!!editId}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: editId
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      color: "#e2e8f0",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    required
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#94a3b8",
                      marginBottom: 4,
                      fontWeight: 500,
                    }}
                  >
                    Name
                  </label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      color: "#e2e8f0",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    required
                  />
                </div>

                {formError && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "rgba(239,68,68,0.12)",
                      borderRadius: 8,
                      color: "#f87171",
                      fontSize: 13,
                      marginBottom: 12,
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      color: "#a0aec0",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "8px 16px",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      border: "none",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {editId ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

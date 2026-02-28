"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  isLoggedIn,
  logout,
  getUsername,
  getHistory,
  deleteUpload,
  getResults,
  downloadExport,
  HistoryItem,
} from "../lib/api";
import LoginPage from "../components/LoginPage";

export default function HistoryPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loggedIn = isLoggedIn();
    setAuthenticated(loggedIn);
    setAuthChecked(true);
    if (loggedIn) {
      loadHistory();
    }
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getHistory();
      setHistory(items || []);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this upload?")) return;
    setDeletingId(id);
    try {
      await deleteUpload(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
    setDeletingId(null);
  }, []);

  const handleExport = useCallback(async (id: string) => {
    try {
      await downloadExport(id, "both");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const handleView = useCallback((id: string) => {
    // Navigate to main page with upload_id — we'll store it and redirect
    window.location.href = `/?upload_id=${id}`;
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthenticated(false);
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return "status-completed";
      case "processing":
        return "status-processing";
      case "failed":
        return "status-failed";
      default:
        return "";
    }
  };

  if (!authChecked) {
    return (
      <div className="loading-fullscreen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginPage
        onLoginSuccess={() => {
          setAuthenticated(true);
          loadHistory();
        }}
      />
    );
  }

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">BB</div>
          <div>
            <div className="header-title">Upload History</div>
            <div className="header-subtitle">Past Cashflow Analyses</div>
          </div>
        </div>
        <div className="header-actions">
          <a href="/" className="btn-sample header-nav-link">
            🏠 Home
          </a>
          <div className="header-user">
            <span className="header-username">{getUsername()}</span>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="main-container">
        {error && (
          <div className="error-box fade-in">
            <span className="error-icon">⚠️</span>
            <div className="error-text">{error}</div>
          </div>
        )}

        {loading ? (
          <div className="loading-section">
            <div className="loading-spinner" />
            <span>Loading history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">📂</div>
            <h3>No uploads yet</h3>
            <p>
              Go to the{" "}
              <a href="/" style={{ color: "var(--orange-400)" }}>
                home page
              </a>{" "}
              to upload and process your first CSV file.
            </p>
          </div>
        ) : (
          <div className="history-grid fade-in">
            {history.map((item) => (
              <div key={item.id} className="history-card">
                <div className="history-card-header">
                  <div className="history-filename">{item.filename}</div>
                  <span
                    className={`history-status ${getStatusClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="history-card-body">
                  <div className="history-meta">
                    <span>📅 {formatDate(item.uploaded_at)}</span>
                    <span>📊 {item.total_rows.toLocaleString()} rows</span>
                  </div>
                  {item.error_message && (
                    <div className="history-error">{item.error_message}</div>
                  )}
                </div>
                <div className="history-card-actions">
                  {item.status === "completed" && (
                    <>
                      <button
                        className="history-btn history-btn-view"
                        onClick={() => handleView(item.id)}
                      >
                        👁 View Results
                      </button>
                      <button
                        className="history-btn history-btn-export"
                        onClick={() => handleExport(item.id)}
                      >
                        📥 Export
                      </button>
                    </>
                  )}
                  <button
                    className="history-btn history-btn-delete"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "⏳" : "🗑"} Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import React, { useState, useCallback, useRef } from "react";
import { parseTxtFile, LoanRecord } from "./lib/parser";
import {
  processRecords,
  CashflowBBIResult,
  InterestResult,
  TIME_BUCKETS,
} from "./lib/cashflow";

type FilterType = "bbi" | "interest" | "both";

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

/* =============== TABLE COMPONENT =============== */
function ResultTable({
  title,
  badge,
  data,
  type,
}: {
  title: string;
  badge: string;
  data: (CashflowBBIResult | InterestResult)[];
  type: "bbi" | "interest";
}) {
  return (
    <div className="results-section fade-in">
      <div className="results-header">
        <h2>{title}</h2>
        <span className="results-badge">{badge}</span>
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reporting Date</th>
              <th>Account ID</th>
              <th>CCY</th>
              <th>Outstanding</th>
              <th>Interest Rate</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Installment</th>
              <th>Product Type</th>
              <th>Segment</th>
              <th>Daerah</th>
              <th>KodePos</th>
              <th>Insured</th>
              <th>Transactional</th>
              <th className="col-separator">Rem. Days</th>
              <th>CF ≤30D</th>
              <th>CF &gt;30D</th>
              <th>CF &lt;6M</th>
              <th>CF 6M-12M</th>
              <th>CF &gt;12M</th>
              {TIME_BUCKETS.map(([label], i) => (
                <th key={i} className={i === 0 ? "col-separator" : ""}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{formatDate(row.reportingDate)}</td>
                <td>{row.accountId}</td>
                <td>{row.ccy}</td>
                <td>{formatNumber(row.outstanding)}</td>
                <td>{formatPercent(row.interestRate)}</td>
                <td>{formatDate(row.startDate)}</td>
                <td>{formatDate(row.endDate)}</td>
                <td>{row.installment}</td>
                <td>{row.productType}</td>
                <td>{row.segment}</td>
                <td>{row.daerah}</td>
                <td>{row.kodePos}</td>
                <td>{row.insuredUninsured}</td>
                <td>{row.transactional}</td>
                <td className="col-separator">{row.remainingDays}</td>
                <td>{formatNumber(row.cf30d)}</td>
                <td>{formatNumber(row.cfGt30d)}</td>
                <td>{formatNumber(row.cf6m)}</td>
                <td>{formatNumber(row.cf6mTo12m)}</td>
                <td>{formatNumber(row.cfGt12m)}</td>
                {row.buckets.map((val, bi) => (
                  <td key={bi} className={bi === 0 ? "col-separator" : ""}>
                    {formatNumber(val)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =============== MAIN PAGE =============== */
export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<LoanRecord[]>([]);
  const [bbiResults, setBbiResults] = useState<CashflowBBIResult[]>([]);
  const [interestResults, setInterestResults] = useState<InterestResult[]>([]);
  const [filter, setFilter] = useState<FilterType>("both");
  const [error, setError] = useState<string | null>(null);
  const [processed, setProcessed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setProcessed(false);
    setBbiResults([]);
    setInterestResults([]);
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
      const { bbiResults: bbi, interestResults: interest } =
        processRecords(parsed);
      setBbiResults(bbi);
      setInterestResults(interest);
      setProcessed(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [file]);

  const handleDownloadSample = useCallback(() => {
    const a = document.createElement("a");
    a.href = "/sample_data.txt";
    a.download = "sample_data.txt";
    a.click();
  }, []);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setRecords([]);
    setBbiResults([]);
    setInterestResults([]);
    setProcessed(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* Stats */
  const totalOutstanding = records.reduce((s, r) => s + r.outstanding, 0);
  const uniqueCurrencies = [...new Set(records.map((r) => r.ccy))];

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
          📥 Download Sample TXT
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
              Drop your TXT file here or click to browse
            </div>
            <div className="upload-text-sub">
              Supports <span>.txt</span> files — tab, semicolon, or comma
              delimited
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
          <div className="filter-group">
            <button
              className={`filter-btn ${filter === "bbi" ? "active" : ""}`}
              onClick={() => setFilter("bbi")}
            >
              Installment Cashflow BBI
            </button>
            <button
              className={`filter-btn ${filter === "interest" ? "active" : ""}`}
              onClick={() => setFilter("interest")}
            >
              Installment Interest
            </button>
            <button
              className={`filter-btn ${filter === "both" ? "active" : ""}`}
              onClick={() => setFilter("both")}
            >
              Both
            </button>
          </div>

          <button
            className="btn-process"
            disabled={!file}
            onClick={handleProcess}
          >
            ▶ Process Cashflow
          </button>
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
              <div className="stat-label">Installment Records</div>
              <div className="stat-value">
                {
                  records.filter((r) => r.installment.toLowerCase() === "yes")
                    .length
                }
              </div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {processed && (filter === "bbi" || filter === "both") && (
          <ResultTable
            title="Installment Cashflow BBI"
            badge="BBI"
            data={bbiResults}
            type="bbi"
          />
        )}

        {processed && (filter === "interest" || filter === "both") && (
          <ResultTable
            title="Installment Interest"
            badge="Interest"
            data={interestResults}
            type="interest"
          />
        )}

        {/* EMPTY STATE */}
        {!processed && !error && (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">📊</div>
            <h3>No data yet</h3>
            <p>
              Upload a TXT file with your loan data, then click{" "}
              <strong>&quot;Process Cashflow&quot;</strong> to see the results.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

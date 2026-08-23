"use client";

/**
 * Application-wide modal system.
 *
 * Replaces every window.alert / window.confirm in the app so messages are
 * styled, scrollable, and able to carry structured detail — in particular the
 * per-row validation errors returned by the upload endpoint.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import type { ValidationError } from "../lib/api";

export type ModalTone = "info" | "success" | "warning" | "danger";

interface AlertOptions {
  title: string;
  message?: string;
  tone?: ModalTone;
  /** Extra lines shown in a scrollable list under the message. */
  details?: string[];
  confirmLabel?: string;
}

interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Return an error string to block submission, or null when the value is fine. */
  validate?: (value: string) => string | null;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  tone?: ModalTone;
  confirmLabel?: string;
  cancelLabel?: string;
  details?: string[];
}

interface ValidationOptions {
  /** Name of the file that failed, shown in the subtitle. */
  fileName?: string;
  title?: string;
  /** Rendered above the table — e.g. a reminder about the master data guide. */
  hint?: React.ReactNode;
}

interface ModalApi {
  showAlert: (opts: AlertOptions) => Promise<void>;
  showError: (title: string, message?: string, details?: string[]) => Promise<void>;
  showSuccess: (title: string, message?: string) => Promise<void>;
  showConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Resolves with the entered text, or null when cancelled. */
  showPrompt: (opts: PromptOptions) => Promise<string | null>;
  showValidationErrors: (
    errors: ValidationError[],
    opts?: ValidationOptions,
  ) => Promise<void>;
}

const ModalContext = createContext<ModalApi | null>(null);

/** Access the modal API. Safe to call from any client component under the provider. */
export function useModal(): ModalApi {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error("useModal must be used inside <ModalProvider>");
  }
  return ctx;
}

const TONE_ICON: Record<ModalTone, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  danger: "⛔",
};

type Dialog =
  | { kind: "alert"; opts: AlertOptions; resolve: () => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void }
  | {
      kind: "validation";
      errors: ValidationError[];
      opts: ValidationOptions;
      resolve: () => void;
    };

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setDialog(null), []);

  const api = useMemo<ModalApi>(() => {
    const showAlert = (opts: AlertOptions) =>
      new Promise<void>((resolve) => {
        setDialog({
          kind: "alert",
          opts,
          resolve: () => {
            setDialog(null);
            resolve();
          },
        });
      });

    return {
      showAlert,
      showError: (title, message, details) =>
        showAlert({ title, message, details, tone: "danger" }),
      showSuccess: (title, message) =>
        showAlert({ title, message, tone: "success" }),
      showConfirm: (opts) =>
        new Promise<boolean>((resolve) => {
          setDialog({
            kind: "confirm",
            opts,
            resolve: (ok) => {
              setDialog(null);
              resolve(ok);
            },
          });
        }),
      showPrompt: (opts) =>
        new Promise<string | null>((resolve) => {
          setDialog({
            kind: "prompt",
            opts,
            resolve: (v) => {
              setDialog(null);
              resolve(v);
            },
          });
        }),
      showValidationErrors: (errors, opts = {}) =>
        new Promise<void>((resolve) => {
          setDialog({
            kind: "validation",
            errors,
            opts,
            resolve: () => {
              setDialog(null);
              resolve();
            },
          });
        }),
    };
  }, []);

  return (
    <ModalContext.Provider value={api}>
      {children}
      {mounted && dialog
        ? ReactDOM.createPortal(
            <ModalHost dialog={dialog} onDismiss={close} />,
            document.body,
          )
        : null}
    </ModalContext.Provider>
  );
}

function ModalHost({
  dialog,
  onDismiss,
}: {
  dialog: Dialog;
  onDismiss: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    if (dialog.kind === "confirm") dialog.resolve(false);
    else if (dialog.kind === "prompt") dialog.resolve(null);
    else dialog.resolve();
    onDismiss();
  }, [dialog, onDismiss]);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  if (dialog.kind === "prompt") {
    return (
      <PromptModal
        opts={dialog.opts}
        onSubmit={(v) => dialog.resolve(v)}
        onCancel={() => dialog.resolve(null)}
      />
    );
  }

  if (dialog.kind === "validation") {
    return (
      <ValidationModal
        errors={dialog.errors}
        opts={dialog.opts}
        onClose={() => dialog.resolve()}
      />
    );
  }

  const tone: ModalTone =
    dialog.opts.tone || (dialog.kind === "confirm" ? "warning" : "info");
  const isConfirm = dialog.kind === "confirm";

  return (
    <div className="bb-modal-overlay" onMouseDown={dismiss}>
      <div
        className={`bb-modal bb-modal-${tone}`}
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bb-modal-head">
          <span className="bb-modal-icon">{TONE_ICON[tone]}</span>
          <h3 className="bb-modal-title">{dialog.opts.title}</h3>
        </div>

        {dialog.opts.message && (
          <p className="bb-modal-message">{dialog.opts.message}</p>
        )}

        {dialog.opts.details && dialog.opts.details.length > 0 && (
          <ul className="bb-modal-details">
            {dialog.opts.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}

        <div className="bb-modal-actions">
          {isConfirm && (
            <button
              className="bb-modal-btn bb-modal-btn-ghost"
              onClick={() => dialog.resolve(false)}
            >
              {dialog.opts.cancelLabel || "Cancel"}
            </button>
          )}
          <button
            ref={confirmRef}
            className={`bb-modal-btn bb-modal-btn-${tone}`}
            onClick={() =>
              isConfirm ? dialog.resolve(true) : dialog.resolve()
            }
          >
            {dialog.opts.confirmLabel || (isConfirm ? "Confirm" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  VALIDATION ERROR MODAL                                      */
/* ============================================================ */

const ERRORS_PER_PAGE = 60;

function ValidationModal({
  errors,
  opts,
  onClose,
}: {
  errors: ValidationError[];
  opts: ValidationOptions;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(ERRORS_PER_PAGE);

  // One entry per column, so "Product Type is wrong on 40 rows" reads as a
  // single problem to fix rather than 40 separate ones.
  const byColumn = useMemo(() => {
    const groups = new Map<string, ValidationError[]>();
    for (const e of errors) {
      const key = e.column || "File";
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [errors]);

  const isHeaderProblem = errors.every((e) => e.row <= 1);

  const copyAll = () => {
    const text = errors
      .map((e) =>
        e.row > 0
          ? `Row ${e.row} · ${e.column || "-"}: ${e.message}`
          : `${e.column || "File"}: ${e.message}`,
      )
      .join("\n");
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="bb-modal-overlay" onMouseDown={onClose}>
      <div
        className="bb-modal bb-modal-danger bb-modal-wide"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bb-modal-head">
          <span className="bb-modal-icon">⛔</span>
          <div>
            <h3 className="bb-modal-title">
              {opts.title || "Upload rejected — the file does not match the master data"}
            </h3>
            <p className="bb-modal-subtitle">
              {opts.fileName ? `${opts.fileName} · ` : ""}
              {errors.length} problem{errors.length === 1 ? "" : "s"} found
              {isHeaderProblem ? " in the header row" : ""}. Nothing was
              imported.
            </p>
          </div>
        </div>

        {opts.hint && <div className="bb-modal-hint">{opts.hint}</div>}

        <div className="bb-modal-summary">
          {byColumn.map(([column, list]) => (
            <span key={column} className="bb-modal-chip">
              {column}
              <b>{list.length}</b>
            </span>
          ))}
        </div>

        <div className="bb-modal-table-wrap">
          <table className="bb-modal-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Row</th>
                <th style={{ width: 190 }}>Column</th>
                <th>What is wrong</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, shown).map((e, i) => (
                <tr key={i}>
                  <td className="bb-modal-cell-row">
                    {e.row > 0 ? e.row : "—"}
                  </td>
                  <td className="bb-modal-cell-col">{e.column || "File"}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown < errors.length && (
            <button
              className="bb-modal-more"
              onClick={() => setShown((n) => n + ERRORS_PER_PAGE)}
            >
              Show {Math.min(ERRORS_PER_PAGE, errors.length - shown)} more of{" "}
              {errors.length - shown} remaining
            </button>
          )}
        </div>

        <div className="bb-modal-actions">
          <button className="bb-modal-btn bb-modal-btn-ghost" onClick={copyAll}>
            Copy all
          </button>
          <button className="bb-modal-btn bb-modal-btn-danger" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  PROMPT MODAL — replaces window.prompt                       */
/* ============================================================ */

function PromptModal({
  opts,
  onSubmit,
  onCancel,
}: {
  opts: PromptOptions;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(opts.defaultValue || "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    const problem = opts.validate
      ? opts.validate(trimmed)
      : trimmed
        ? null
        : "This field cannot be empty.";
    if (problem) {
      setError(problem);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="bb-modal-overlay" onMouseDown={onCancel}>
      <div
        className="bb-modal bb-modal-info"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bb-modal-head">
          <span className="bb-modal-icon">✏️</span>
          <div>
            <h3 className="bb-modal-title">{opts.title}</h3>
            {opts.message && (
              <p className="bb-modal-subtitle">{opts.message}</p>
            )}
          </div>
        </div>

        <form onSubmit={submit}>
          <label className="admin-field">
            {opts.label && <span>{opts.label}</span>}
            <input
              ref={inputRef}
              value={value}
              placeholder={opts.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError("");
              }}
            />
          </label>

          {error && <div className="admin-form-error">{error}</div>}

          <div className="bb-modal-actions">
            <button
              type="button"
              className="bb-modal-btn bb-modal-btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="submit" className="bb-modal-btn bb-modal-btn-info">
              {opts.confirmLabel || "OK"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

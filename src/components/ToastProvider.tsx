"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Toast, ToastType } from "./Toast";

interface ToastContextType {
  show: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => setToasts([]), []);

  const show = useCallback((message: string, type: ToastType = "info", duration = 5000) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string, duration?: number) => show(message, "success", duration), [show]);
  const error = useCallback((message: string, duration?: number) => show(message, "error", duration), [show]);
  const info = useCallback((message: string, duration?: number) => show(message, "info", duration), [show]);

  // Stack newest-first. Cap visible to MAX_VISIBLE; everything older lives
  // behind a "+N more" pill but stays in state so its dismiss timer still
  // fires.
  const ordered = [...toasts].reverse();
  const visible = ordered.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(0, ordered.length - visible.length);

  return (
    <ToastContext.Provider value={{ show, success, error, info, clearAll }}>
      {children}
      <div
        className="toast-container"
        role="status"
        aria-live="polite"
        aria-label="Notifications"
      >
        {hiddenCount > 0 && (
          <div className="toast-stack-summary" role="group" aria-label="Notification controls">
            <span>+{hiddenCount} more</span>
            <button
              type="button"
              className="toast-clear-all"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
        )}
        {visible.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
      <style jsx>{`
        .toast-container {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          z-index: 9999;
          pointer-events: none;
        }

        .toast-stack-summary {
          pointer-events: auto;
          align-self: flex-end;
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.3rem 0.6rem;
          font-size: 0.75rem;
          background: var(--surface-1, #fff);
          border: 1px solid var(--line, #d8d3c5);
          border-radius: 999px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }

        .toast-clear-all {
          background: transparent;
          border: 0;
          color: var(--accent, #006d77);
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }

        .toast-clear-all:hover {
          text-decoration: underline;
        }

        @media (max-width: 768px) {
          .toast-container {
            bottom: 5rem;
            right: 1rem;
            left: 1rem;
            align-items: center;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

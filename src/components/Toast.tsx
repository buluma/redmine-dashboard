"use client";

import React from "react";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  const toneClass = type === "success" ? "tone-ok" : type === "error" ? "tone-danger" : "tone-info";

  return (
    <div className={`toast-item ${toneClass}`} onClick={onClose} role="alert" aria-live="polite">
      <span className="toast-icon">{icon}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Dismiss">
        ✕
      </button>
      <style jsx>{`
        .toast-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: var(--card, #fff);
          border: 1px solid var(--line, #ddd);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          min-width: 280px;
          max-width: 420px;
          cursor: pointer;
          pointer-events: auto;
          animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .toast-item:hover {
          transform: scale(1.02);
        }

        .tone-ok {
          border-left: 4px solid var(--ok, #2a7f52);
          background: var(--ok-soft, #e1f4e9);
        }

        .tone-danger {
          border-left: 4px solid var(--danger, #9f2f2f);
          background: var(--danger-soft, #fbe6e6);
        }

        .tone-info {
          border-left: 4px solid var(--accent, #006d77);
          background: var(--accent-soft, #d8eff1);
        }

        .toast-icon {
          font-size: 1.25rem;
        }

        .toast-message {
          flex: 1;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--ink, #1d2a3a);
        }

        .toast-close {
          background: transparent;
          border: none;
          color: var(--ink-soft, #5b6a7b);
          padding: 0.25rem;
          cursor: pointer;
          font-size: 0.8rem;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .toast-close:hover {
          opacity: 1;
        }

        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .toast-item {
            min-width: auto;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

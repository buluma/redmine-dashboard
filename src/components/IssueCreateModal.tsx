"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "./ToastProvider";
import { useI18n } from "./I18nProvider";
import type { Issue } from "@/src/types/dashboard";

interface Project {
  id: number;
  name: string;
}

interface Status {
  id: number;
  name: string;
}

interface Priority {
  id: number;
  name: string;
}

interface IssueCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
  statuses: Status[];
  priorities: Priority[];
}

export function IssueCreateModal({ isOpen, onClose, onCreated, statuses, priorities }: IssueCreateModalProps) {
  const toast = useToast();
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number>(0);
  const [statusId, setStatusId] = useState<number>(0);
  const [priorityId, setPriorityId] = useState<number>(0);
  const [dueDate, setDueDate] = useState("");

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const fetchedProjects = data.projects || [];
        setProjects(fetchedProjects);
        if (fetchedProjects.length > 0 && projectId === 0) {
          setProjectId(fetchedProjects[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load projects", error);
    } finally {
      setLoadingProjects(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen, loadProjects]);

  useEffect(() => {
    if (statuses.length > 0 && statusId === 0) {
      setStatusId(statuses[0].id);
    }
  }, [statusId, statuses]);

  useEffect(() => {
    if (priorities.length > 0 && priorityId === 0) {
      const defaultPriority = priorities.find((p) => p.name.toLowerCase().includes("normal")) || priorities[0];
      setPriorityId(defaultPriority.id);
    }
  }, [priorities, priorityId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !projectId) {
      toast.error(t("createIssue.errorRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          description,
          projectId,
          statusId,
          priorityId,
          dueDate: dueDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("createIssue.errorFailed"));
      }

      toast.success(t("createIssue.successToast"));
      onCreated(data.issue);
      onClose();
      // Reset form
      setSubject("");
      setDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("createIssue.title")}</h2>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="issue-form">
          <div className="form-group">
            <label>{t("createIssue.projectLabel")}</label>
            <select 
              value={projectId} 
              onChange={(e) => setProjectId(Number(e.target.value))}
              disabled={loadingProjects}
              required
            >
              <option value={0} disabled>{t("createIssue.projectPlaceholder")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t("createIssue.subjectLabel")}</label>
            <input 
              type="text" 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder={t("createIssue.subjectPlaceholder")}
              required 
            />
          </div>

          <div className="form-group">
            <label>{t("createIssue.descriptionLabel")}</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder={t("createIssue.descriptionPlaceholder")}
              rows={4}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t("createIssue.statusLabel")}</label>
              <select value={statusId} onChange={(e) => setStatusId(Number(e.target.value))}>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t("createIssue.priorityLabel")}</label>
              <select value={priorityId} onChange={(e) => setPriorityId(Number(e.target.value))}>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>{t("createIssue.dueDateLabel")}</label>
            <input 
              type="date" 
              value={dueDate} 
              onChange={(e) => setDueDate(e.target.value)} 
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
              {t("createIssue.cancelBtn")}
            </button>
            <button type="submit" className="primary-button" disabled={submitting || loadingProjects}>
              {submitting ? t("createIssue.creatingBtn") : t("createIssue.createBtn")}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: grid;
          place-items: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-content {
          background: var(--card, #fff);
          border: 1px solid var(--line, #ddd);
          border-radius: var(--radius, 16px);
          width: min(600px, 100%);
          box-shadow: var(--shadow);
          animation: scale-up 0.2s ease-out;
        }

        .modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .close-btn {
          background: transparent;
          border: none;
          font-size: 1.25rem;
          color: var(--ink-soft);
          cursor: pointer;
        }

        .issue-form {
          padding: 1.5rem;
          display: grid;
          gap: 1rem;
        }

        .form-group {
          display: grid;
          gap: 0.35rem;
        }

        .form-group label {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--ink-soft);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .modal-actions {
          margin-top: 1rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }

        @keyframes scale-up {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

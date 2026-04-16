"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "./ToastProvider";

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
  onCreated: (issue: any) => void;
  statuses: Status[];
  priorities: Priority[];
}

export function IssueCreateModal({ isOpen, onClose, onCreated, statuses, priorities }: IssueCreateModalProps) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number>(0);
  const [statusId, setStatusId] = useState<number>(0);
  const [priorityId, setPriorityId] = useState<number>(0);
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  useEffect(() => {
    if (statuses.length > 0 && statusId === 0) {
      setStatusId(statuses[0].id);
    }
  }, [statusId, statuses]);

  useEffect(() => {
    if (priorities.length > 0 && priorityId === 0) {
      const defaultPriority = priorities.find((p: any) => p.name.toLowerCase().includes("normal")) || priorities[0];
      setPriorityId(defaultPriority.id);
    }
  }, [priorities, priorityId]);

  async function loadProjects() {
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !projectId) {
      toast.error("Subject and Project are required");
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
        throw new Error(data.error || "Failed to create issue");
      }

      toast.success("Issue created successfully");
      onCreated(data.issue);
      onClose();
      // Reset form
      setSubject("");
      setDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🆕 Create New Issue</h2>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="issue-form">
          <div className="form-group">
            <label>Project *</label>
            <select 
              value={projectId} 
              onChange={(e) => setProjectId(Number(e.target.value))}
              disabled={loadingProjects}
              required
            >
              <option value={0} disabled>Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Subject *</label>
            <input 
              type="text" 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder="Brief summary of the issue"
              required 
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="Detailed explanation..."
              rows={4}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Status</label>
              <select value={statusId} onChange={(e) => setStatusId(Number(e.target.value))}>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Priority</label>
              <select value={priorityId} onChange={(e) => setPriorityId(Number(e.target.value))}>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Due Date</label>
            <input 
              type="date" 
              value={dueDate} 
              onChange={(e) => setDueDate(e.target.value)} 
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={submitting || loadingProjects}>
              {submitting ? "Creating..." : "Create Issue"}
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

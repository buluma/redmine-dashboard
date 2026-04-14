"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CreateLocalIssueResponse = {
  issue?: {
    id: string;
    localIssueNumber?: number | null;
    subject: string;
  };
  error?: string;
  message?: string;
};

export function PersonalTicketCreateForm() {
  const router = useRouter();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tracker, setTracker] = useState("Task");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedSubject = subject.trim();
    if (!trimmedSubject || busy) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {
      subject: trimmedSubject,
      tracker,
      priority,
      statusId: 1,
      statusName: "New",
      doneRatio: 0,
    };

    if (description.trim()) {
      payload.description = description.trim();
    }
    if (dueDate) {
      payload.dueDate = new Date(`${dueDate}T00:00:00`).toISOString();
    }

    try {
      const response = await fetch("/api/issues/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as CreateLocalIssueResponse;
      if (!response.ok) {
        const message = data.message ?? data.error ?? "Failed to create personal ticket";
        setError(message);
        return;
      }

      const createdNumber = data.issue?.localIssueNumber;
      setSuccess(
        createdNumber ? `Created personal ticket #${createdNumber}` : "Personal ticket created"
      );
      setSubject("");
      setDescription("");
      setTracker("Task");
      setPriority("Normal");
      setDueDate("");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create personal ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div
        style={{
          display: "grid",
          gap: "0.7rem",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          alignItems: "end",
        }}
      >
        <label>
          Subject
          <input
            placeholder="What do you need to track?"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            maxLength={500}
            disabled={busy}
          />
        </label>
        <label>
          Tracker
          <select value={tracker} onChange={(event) => setTracker(event.target.value)} disabled={busy}>
            <option value="Task">Task</option>
            <option value="Bug">Bug</option>
            <option value="Feature">Feature</option>
            <option value="Support">Support</option>
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value)} disabled={busy}>
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>
        </label>
        <label>
          Due Date
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={busy} />
        </label>
      </div>

      <label>
        Description (optional)
        <textarea
          placeholder="Add details"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={busy}
        />
      </label>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" disabled={busy || !subject.trim()}>
          {busy ? "Creating..." : "Create Personal Ticket"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setSubject("");
            setDescription("");
            setTracker("Task");
            setPriority("Normal");
            setDueDate("");
            setError(null);
            setSuccess(null);
          }}
        >
          Clear
        </button>
        {success ? <span style={{ color: "var(--ok)", fontSize: "0.9rem" }}>{success}</span> : null}
        {error ? <span style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</span> : null}
      </div>
    </form>
  );
}


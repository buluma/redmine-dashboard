"use client";

import { useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";

interface Series {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  redmineProjectId: number;
  parentIssueId: number;
  trackerId: number;
  priorityId: number;
  categoryId: number | null;
  assignedToId: number | null;
  subjectTemplate: string;
  descriptionTemplate: string | null;
  estimatedHours: number | null;
  customFieldsJson: Array<{ id: number; value: string }> | null;
  cadence: string;
  createWeekday: number;
  closeWeekday: number;
  createDayOfMonth: number;
  closeDayOfMonth: number | null;
  wakatimeProjectName: string;
  defaultActivityId: number;
  defaultActivityName: string;
  expectsTime: boolean;
  instanceCount: number;
}

interface InstanceRow {
  id: string;
  seriesKey: string;
  seriesName: string;
  periodKey: string;
  subject: string;
  issueId: string | null;
  redmineIssueId: number;
  status: string;
  closeAttempts: number;
  lastError: string | null;
  finalHoursApplied: number | null;
  scheduledCreateDate: string;
  scheduledCloseDate: string;
  closedAt: string | null;
  createdAt: string;
}

type FormState = {
  key: string;
  name: string;
  redmineProjectId: string;
  parentIssueId: string;
  trackerId: string;
  priorityId: string;
  categoryId: string;
  assignedToId: string;
  subjectTemplate: string;
  descriptionTemplate: string;
  estimatedHours: string;
  customFieldsJson: string;
  cadence: "weekly" | "monthly";
  createWeekday: string;
  closeWeekday: string;
  createDayOfMonth: string;
  closeDayOfMonth: string;
  wakatimeProjectName: string;
  defaultActivityId: string;
  defaultActivityName: string;
  expectsTime: boolean;
};

const EMPTY_FORM: FormState = {
  key: "",
  name: "",
  redmineProjectId: "",
  parentIssueId: "",
  trackerId: "",
  priorityId: "",
  categoryId: "",
  assignedToId: "",
  subjectTemplate: "",
  descriptionTemplate: "",
  estimatedHours: "",
  customFieldsJson: "",
  cadence: "weekly",
  createWeekday: "1",
  closeWeekday: "7",
  createDayOfMonth: "1",
  closeDayOfMonth: "",
  wakatimeProjectName: "",
  defaultActivityId: "9",
  defaultActivityName: "Development",
  expectsTime: false,
};

function seriesToForm(series: Series): FormState {
  return {
    key: series.key,
    name: series.name,
    redmineProjectId: String(series.redmineProjectId),
    parentIssueId: String(series.parentIssueId),
    trackerId: String(series.trackerId),
    priorityId: String(series.priorityId),
    categoryId: series.categoryId !== null ? String(series.categoryId) : "",
    assignedToId: series.assignedToId !== null ? String(series.assignedToId) : "",
    subjectTemplate: series.subjectTemplate,
    descriptionTemplate: series.descriptionTemplate ?? "",
    estimatedHours: series.estimatedHours !== null ? String(series.estimatedHours) : "",
    customFieldsJson: series.customFieldsJson ? JSON.stringify(series.customFieldsJson, null, 2) : "",
    cadence: series.cadence === "monthly" ? "monthly" : "weekly",
    createWeekday: String(series.createWeekday),
    closeWeekday: String(series.closeWeekday),
    createDayOfMonth: String(series.createDayOfMonth),
    closeDayOfMonth: series.closeDayOfMonth !== null ? String(series.closeDayOfMonth) : "",
    wakatimeProjectName: series.wakatimeProjectName,
    defaultActivityId: String(series.defaultActivityId),
    defaultActivityName: series.defaultActivityName,
    expectsTime: series.expectsTime,
  };
}

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number.parseInt(trimmed, 10);
}

function requiredInt(value: string): number {
  return Number.parseInt(value.trim(), 10);
}

function optionalFloat(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number.parseFloat(trimmed);
}

const WEEKDAYS = [
  { value: "1", key: "monday" },
  { value: "2", key: "tuesday" },
  { value: "3", key: "wednesday" },
  { value: "4", key: "thursday" },
  { value: "5", key: "friday" },
  { value: "6", key: "saturday" },
  { value: "7", key: "sunday" },
];

function statusChipClass(status: string): string {
  switch (status) {
    case "closed":
      return "sync-success";
    case "create_failed":
    case "close_failed":
      return "sync-failed";
    case "resolved_not_closed":
      return "status-chip";
    default:
      return "muted";
  }
}

export function RecurringTicketsClient({
  initialSeries,
  initialInstances,
}: {
  initialSeries: Series[];
  initialInstances: InstanceRow[];
}) {
  const { t, formatDate } = useI18n();
  const [series, setSeries] = useState(initialSeries);
  const [instances] = useState(initialInstances);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/recurring-tickets");
    if (res.ok) {
      const data = await res.json();
      setSeries(data.items ?? []);
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (s: Series) => {
    setEditingId(s.id);
    setFormData(seriesToForm(s));
    setFormError(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const toggleActive = async (s: Series) => {
    setTogglingId(s.id);
    try {
      const res = await fetch(`/api/recurring-tickets/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      if (res.ok) {
        setSeries((prev) => prev.map((item) => (item.id === s.id ? { ...item, isActive: !s.isActive } : item)));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let customFieldsJson: Array<{ id: number; value: string }> | null = null;
    if (formData.customFieldsJson.trim()) {
      try {
        customFieldsJson = JSON.parse(formData.customFieldsJson);
      } catch {
        setFormError(t("recurringTickets.invalidCustomFields"));
        return;
      }
    }

    const payload = {
      key: formData.key.trim(),
      name: formData.name.trim(),
      redmineProjectId: requiredInt(formData.redmineProjectId),
      parentIssueId: requiredInt(formData.parentIssueId),
      trackerId: requiredInt(formData.trackerId),
      priorityId: requiredInt(formData.priorityId),
      categoryId: optionalInt(formData.categoryId),
      assignedToId: optionalInt(formData.assignedToId),
      subjectTemplate: formData.subjectTemplate.trim(),
      descriptionTemplate: formData.descriptionTemplate.trim() || null,
      estimatedHours: optionalFloat(formData.estimatedHours),
      customFieldsJson,
      cadence: formData.cadence,
      createWeekday: requiredInt(formData.createWeekday),
      closeWeekday: requiredInt(formData.closeWeekday),
      createDayOfMonth: requiredInt(formData.createDayOfMonth),
      closeDayOfMonth: optionalInt(formData.closeDayOfMonth),
      wakatimeProjectName: formData.wakatimeProjectName.trim(),
      defaultActivityId: requiredInt(formData.defaultActivityId),
      defaultActivityName: formData.defaultActivityName.trim(),
      expectsTime: formData.expectsTime,
    };

    setSubmitting(true);
    try {
      const url = editingId ? `/api/recurring-tickets/${editingId}` : "/api/recurring-tickets";
      const method = editingId ? "PATCH" : "POST";
      // Editing an existing series never changes its key (immutable after create).
      const body = editingId ? (({ key: _key, ...rest }) => rest)(payload) : payload;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        cancelForm();
        await refresh();
      } else {
        const data = await res.json();
        setFormError(data.error ?? t("recurringTickets.saveFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("common.administration") || "Administration"}</p>
            <h1>{t("recurringTickets.title")}</h1>
            <p className="muted">{t("recurringTickets.description")}</p>
          </div>
          <div className="hero-actions">
            <a href="/ops" className="secondary-button">
              {t("ops.backToOps")}
            </a>
            <button type="button" className="primary-button" onClick={showForm ? cancelForm : startCreate}>
              {showForm ? t("recurringTickets.cancel") : t("recurringTickets.addSeries")}
            </button>
          </div>
        </div>
      </header>

      {showForm && (
        <section className="webhook-form">
          <h3>{editingId ? t("recurringTickets.editSeries") : t("recurringTickets.newSeries")}</h3>
          {formError && <p className="error-banner">{formError}</p>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="key">{t("recurringTickets.keyLabel")}</label>
                <input
                  id="key"
                  type="text"
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  placeholder="drc-support"
                  disabled={!!editingId}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="name">{t("recurringTickets.nameLabel")}</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="DRC Support"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="redmineProjectId">{t("recurringTickets.projectIdLabel")}</label>
                <input
                  id="redmineProjectId"
                  type="number"
                  value={formData.redmineProjectId}
                  onChange={(e) => setFormData({ ...formData, redmineProjectId: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="parentIssueId">{t("recurringTickets.parentIssueIdLabel")}</label>
                <input
                  id="parentIssueId"
                  type="number"
                  value={formData.parentIssueId}
                  onChange={(e) => setFormData({ ...formData, parentIssueId: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="trackerId">{t("recurringTickets.trackerIdLabel")}</label>
                <input
                  id="trackerId"
                  type="number"
                  value={formData.trackerId}
                  onChange={(e) => setFormData({ ...formData, trackerId: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="priorityId">{t("recurringTickets.priorityIdLabel")}</label>
                <input
                  id="priorityId"
                  type="number"
                  value={formData.priorityId}
                  onChange={(e) => setFormData({ ...formData, priorityId: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="categoryId">{t("recurringTickets.categoryIdLabel")}</label>
                <input
                  id="categoryId"
                  type="number"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="assignedToId">{t("recurringTickets.assignedToIdLabel")}</label>
                <input
                  id="assignedToId"
                  type="number"
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="estimatedHours">{t("recurringTickets.estimatedHoursLabel")}</label>
                <input
                  id="estimatedHours"
                  type="number"
                  step="0.5"
                  value={formData.estimatedHours}
                  onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="subjectTemplate">{t("recurringTickets.subjectTemplateLabel")}</label>
              <input
                id="subjectTemplate"
                type="text"
                value={formData.subjectTemplate}
                onChange={(e) => setFormData({ ...formData, subjectTemplate: e.target.value })}
                placeholder="Week {{week}} DRC Support"
                required
              />
              <p className="muted">{t("recurringTickets.subjectTemplateHint")}</p>
            </div>

            <div className="form-group">
              <label htmlFor="descriptionTemplate">{t("recurringTickets.descriptionTemplateLabel")}</label>
              <textarea
                id="descriptionTemplate"
                value={formData.descriptionTemplate}
                onChange={(e) => setFormData({ ...formData, descriptionTemplate: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="customFieldsJson">{t("recurringTickets.customFieldsLabel")}</label>
              <textarea
                id="customFieldsJson"
                value={formData.customFieldsJson}
                onChange={(e) => setFormData({ ...formData, customFieldsJson: e.target.value })}
                placeholder='[{"id": 20, "value": "Major"}]'
                rows={3}
              />
              <p className="muted">{t("recurringTickets.customFieldsHint")}</p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cadence">{t("recurringTickets.cadenceLabel")}</label>
                <select
                  id="cadence"
                  value={formData.cadence}
                  onChange={(e) => setFormData({ ...formData, cadence: e.target.value as "weekly" | "monthly" })}
                >
                  <option value="weekly">{t("recurringTickets.cadenceWeekly")}</option>
                  <option value="monthly">{t("recurringTickets.cadenceMonthly")}</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="wakatimeProjectName">{t("recurringTickets.wakatimeProjectLabel")}</label>
                <input
                  id="wakatimeProjectName"
                  type="text"
                  value={formData.wakatimeProjectName}
                  onChange={(e) => setFormData({ ...formData, wakatimeProjectName: e.target.value })}
                  required
                />
              </div>
            </div>

            {formData.cadence === "weekly" ? (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="createWeekday">{t("recurringTickets.createWeekdayLabel")}</label>
                  <select
                    id="createWeekday"
                    value={formData.createWeekday}
                    onChange={(e) => setFormData({ ...formData, createWeekday: e.target.value })}
                  >
                    {WEEKDAYS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {t(`recurringTickets.weekday.${w.key}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="closeWeekday">{t("recurringTickets.closeWeekdayLabel")}</label>
                  <select
                    id="closeWeekday"
                    value={formData.closeWeekday}
                    onChange={(e) => setFormData({ ...formData, closeWeekday: e.target.value })}
                  >
                    {WEEKDAYS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {t(`recurringTickets.weekday.${w.key}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="createDayOfMonth">{t("recurringTickets.createDayOfMonthLabel")}</label>
                  <input
                    id="createDayOfMonth"
                    type="number"
                    min={1}
                    max={31}
                    value={formData.createDayOfMonth}
                    onChange={(e) => setFormData({ ...formData, createDayOfMonth: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="closeDayOfMonth">{t("recurringTickets.closeDayOfMonthLabel")}</label>
                  <input
                    id="closeDayOfMonth"
                    type="number"
                    min={1}
                    max={31}
                    value={formData.closeDayOfMonth}
                    onChange={(e) => setFormData({ ...formData, closeDayOfMonth: e.target.value })}
                    placeholder={t("recurringTickets.closeDayOfMonthPlaceholder")}
                  />
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="defaultActivityId">{t("recurringTickets.activityIdLabel")}</label>
                <input
                  id="defaultActivityId"
                  type="number"
                  value={formData.defaultActivityId}
                  onChange={(e) => setFormData({ ...formData, defaultActivityId: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="defaultActivityName">{t("recurringTickets.activityNameLabel")}</label>
                <input
                  id="defaultActivityName"
                  type="text"
                  value={formData.defaultActivityName}
                  onChange={(e) => setFormData({ ...formData, defaultActivityName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="event-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.expectsTime}
                    onChange={(e) => setFormData({ ...formData, expectsTime: e.target.checked })}
                  />
                  <span>{t("recurringTickets.expectsTimeLabel")}</span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" onClick={cancelForm} className="secondary-button">
                {t("recurringTickets.cancel")}
              </button>
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? t("recurringTickets.saving") : editingId ? t("recurringTickets.saveChanges") : t("recurringTickets.createBtn")}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="table-toolbar">
          <h2>{t("recurringTickets.seriesTitle")}</h2>
          <p className="muted">{t("recurringTickets.seriesCount", { count: series.length })}</p>
        </div>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>{t("recurringTickets.colKey")}</th>
                <th>{t("recurringTickets.colCadence")}</th>
                <th>{t("recurringTickets.colSchedule")}</th>
                <th>{t("recurringTickets.colWakatime")}</th>
                <th>{t("recurringTickets.colInstances")}</th>
                <th>{t("common.status")}</th>
                <th>{t("ops.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {series.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">{t("recurringTickets.noSeries")}</td>
                </tr>
              )}
              {series.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div>
                      <strong>{s.name}</strong>
                      <br />
                      <span className="muted">{s.key}</span>
                    </div>
                  </td>
                  <td>{s.cadence === "monthly" ? t("recurringTickets.cadenceMonthly") : t("recurringTickets.cadenceWeekly")}</td>
                  <td className="muted">
                    {s.cadence === "monthly"
                      ? t("recurringTickets.scheduleMonthly", { create: s.createDayOfMonth, close: s.closeDayOfMonth ?? "-" })
                      : t("recurringTickets.scheduleWeekly", {
                          create: t(`recurringTickets.weekday.${WEEKDAYS[s.createWeekday - 1]?.key ?? "monday"}`),
                          close: t(`recurringTickets.weekday.${WEEKDAYS[s.closeWeekday - 1]?.key ?? "sunday"}`),
                        })}
                  </td>
                  <td className="muted">{s.wakatimeProjectName}</td>
                  <td>{s.instanceCount}</td>
                  <td>
                    <span className={`status-chip ${s.isActive ? "sync-success" : "muted"}`}>
                      {s.isActive ? t("recurringTickets.active") : t("recurringTickets.inactive")}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="secondary-button" onClick={() => startEdit(s)}>
                        {t("recurringTickets.edit")}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={togglingId === s.id}
                        onClick={() => toggleActive(s)}
                      >
                        {togglingId === s.id
                          ? t("recurringTickets.saving")
                          : s.isActive
                            ? t("recurringTickets.deactivate")
                            : t("recurringTickets.activate")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="table-toolbar">
          <h2>{t("recurringTickets.historyTitle")}</h2>
          <p className="muted">{t("recurringTickets.historyCount", { count: instances.length })}</p>
        </div>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>{t("recurringTickets.colSeries")}</th>
                <th>{t("recurringTickets.colPeriod")}</th>
                <th>{t("common.status")}</th>
                <th>{t("recurringTickets.colHours")}</th>
                <th>{t("recurringTickets.colCloseAttempts")}</th>
                <th>{t("recurringTickets.colScheduledClose")}</th>
                <th>{t("recurringTickets.colError")}</th>
              </tr>
            </thead>
            <tbody>
              {instances.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">{t("recurringTickets.noInstances")}</td>
                </tr>
              )}
              {instances.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>
                      <strong>{row.seriesName}</strong>
                      <br />
                      <span className="muted">{row.periodKey}</span>
                    </div>
                  </td>
                  <td className="muted">{row.subject}</td>
                  <td>
                    <span className={`status-chip ${statusChipClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td>{row.finalHoursApplied ?? "-"}</td>
                  <td>{row.closeAttempts}</td>
                  <td className="muted">{formatDate(row.scheduledCloseDate)}</td>
                  <td className="muted">{row.lastError ? row.lastError.slice(0, 140) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  type ChartOptions,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

export interface DashboardStats {
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  issuesByStatus: { status: string; count: number }[];
  issuesByPriority: { priority: string; count: number }[];
  recentActivity: { date: string; count: number }[];
}

interface DashboardWidgetsProps {
  stats: DashboardStats;
}

const statusColors = [
  "#2a7f52", // green
  "#c65d1f", // orange
  "#006d77", // teal
  "#9f2f2f", // red
  "#5b6a7b", // gray
];

export function DashboardWidgets({ stats }: DashboardWidgetsProps) {
  // Status distribution chart
  const statusChartData = useMemo(() => ({
    labels: stats.issuesByStatus.map(s => s.status),
    datasets: [{
      data: stats.issuesByStatus.map(s => s.count),
      backgroundColor: statusColors.slice(0, stats.issuesByStatus.length),
      borderWidth: 0,
    }],
  }), [stats.issuesByStatus]);

  // Priority distribution chart
  const priorityChartData = useMemo(() => ({
    labels: stats.issuesByPriority.map(p => p.priority),
    datasets: [{
      data: stats.issuesByPriority.map(p => p.count),
      backgroundColor: ["#9f2f2f", "#c65d1f", "#006d77", "#2a7f52", "#5b6a7b"],
      borderWidth: 0,
    }],
  }), [stats.issuesByPriority]);

  // Recent activity chart
  const activityChartData = useMemo(() => ({
    labels: stats.recentActivity.map(a => a.date),
    datasets: [{
      label: "Issues Updated",
      data: stats.recentActivity.map(a => a.count),
      borderColor: "#006d77",
      backgroundColor: "rgba(0, 109, 119, 0.1)",
      pointBackgroundColor: "#ffffff",
      pointBorderColor: "#0a556a",
      pointRadius: 3,
      pointHoverRadius: 5,
      fill: true,
      tension: 0.3,
    }],
  }), [stats.recentActivity]);

  const doughnutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          color: "#4f647c",
          font: { size: 12, weight: 600 },
          padding: 20,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: "#183042",
        titleColor: "#f4fbff",
        bodyColor: "#dceaf3",
        borderColor: "#2d4f66",
        borderWidth: 1,
      },
    },
  };

  const lineOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#4f647c",
          font: { size: 12, weight: 600 },
          usePointStyle: true,
          padding: 18,
        },
      },
      tooltip: {
        backgroundColor: "#183042",
        titleColor: "#f4fbff",
        bodyColor: "#dceaf3",
        borderColor: "#2d4f66",
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(153, 171, 190, 0.25)" },
        ticks: { color: "#5a6d83", maxRotation: 0, autoSkip: true },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(153, 171, 190, 0.28)" },
        ticks: { color: "#5a6d83", precision: 0 },
      },
    },
  };

  return (
    <div className="dashboard-widgets">
      {/* Summary Cards */}
      <div className="widget-row">
        <div className="stat-card">
          <span className="stat-value">{stats.totalIssues}</span>
          <span className="stat-label">Total Issues</span>
        </div>
        <div className="stat-card open">
          <span className="stat-value">{stats.openIssues}</span>
          <span className="stat-label">Open</span>
        </div>
        <div className="stat-card closed">
          <span className="stat-value">{stats.closedIssues}</span>
          <span className="stat-label">Closed</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="widget-row charts">
        <div className="widget-card">
          <h3>By Status</h3>
          <div className="chart-container">
            {stats.issuesByStatus.length > 0 ? (
              <Doughnut data={statusChartData} options={doughnutOptions} />
            ) : (
              <p className="muted">No data</p>
            )}
          </div>
        </div>

        <div className="widget-card">
          <h3>By Priority</h3>
          <div className="chart-container">
            {stats.issuesByPriority.length > 0 ? (
              <Doughnut data={priorityChartData} options={doughnutOptions} />
            ) : (
              <p className="muted">No data</p>
            )}
          </div>
        </div>

        <div className="widget-card wide">
          <h3>Recent Activity</h3>
          <div className="chart-container">
            {stats.recentActivity.length > 0 ? (
              <Line data={activityChartData} options={lineOptions} />
            ) : (
              <p className="muted">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple stats from issues data
export function calculateStats(issues: {
  statusId: number;
  statusName?: string;
  priorityId?: number | null;
  priorityName?: string | null;
  updatedAt?: string;
  lastActivityAt?: string | null;
  closedAt?: string | null;
}[]): DashboardStats {
  const totalIssues = issues.length;
  const openIssues = issues.filter(i => !i.closedAt).length;
  const closedIssues = issues.filter(i => i.closedAt).length;

  // Group by status
  const statusMap = new Map<string, number>();
  issues.forEach(issue => {
    const name = issue.statusName || `Status ${issue.statusId}`;
    statusMap.set(name, (statusMap.get(name) || 0) + 1);
  });
  const issuesByStatus = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Group by priority
  const priorityMap = new Map<string, number>();
  issues.forEach(issue => {
    const name = issue.priorityName || `Priority ${issue.priorityId}`;
    priorityMap.set(name, (priorityMap.get(name) || 0) + 1);
  });
  const issuesByPriority = Array.from(priorityMap.entries())
    .map(([priority, count]) => ({ priority, count }))
    .sort((a, b) => b.count - a.count);

  // Group by date (last 7 days)
  const dateMap = new Map<string, number>();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dateMap.set(key, 0);
  }
  issues.forEach(issue => {
    const activity = issue.lastActivityAt ?? issue.updatedAt;
    if (activity) {
      const date = new Date(activity);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (dateMap.has(key)) {
        dateMap.set(key, (dateMap.get(key) || 0) + 1);
      }
    }
  });
  const recentActivity = Array.from(dateMap.entries())
    .map(([date, count]) => ({ date, count }));

  return {
    totalIssues,
    openIssues,
    closedIssues,
    issuesByStatus,
    issuesByPriority,
    recentActivity,
  };
}

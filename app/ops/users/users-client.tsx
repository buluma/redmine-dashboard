"use client";

import { useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";

interface User {
  id: string;
  emailOrUsername: string;
  displayName: string;
  role: string;
  createdAt: string;
  redmineBaseUrl: string | null;
}

export function UsersClient({ initialUsers, currentUserId }: { initialUsers: User[]; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [updating, setUpdating] = useState<string | null>(null);
  const { t, formatDate } = useI18n();

  async function updateRole(userId: string, newRole: string) {
    if (userId === currentUserId) return;
    
    // Map display role to enum
    const roleMap: Record<string, string> = {
      "Administrator": "ADMIN",
      "Editor": "EDITOR",
      "User": "USER",
      "Viewer": "VIEWER",
    };
    const newRoleEnum = roleMap[newRole] || newRole;
    
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRole: newRoleEnum }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? t("common.error"));
        return;
      }
      
      const data = await res.json();
      setUsers(users.map(u => 
        u.id === userId ? { ...u, role: data.user.role } : u
      ));
    } catch (e) {
      alert(t("common.error"));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("common.administration") || "Administration"}</p>
            <h1>{t("ops.userMgmtTitle")}</h1>
            <p className="muted">{t("ops.userMgmtDesc")}</p>
          </div>
          <div className="hero-actions">
            <a href="/ops" className="secondary-button">
              {t("ops.backToOps")}
            </a>
          </div>
        </div>
      </header>

      <section className="card">
        <div className="table-toolbar">
          <h2>{t("ops.allUsers")}</h2>
          <p className="muted">{t("ops.userCount", { count: users.length })}</p>
        </div>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>{t("ops.colUser")}</th>
                <th>{t("ops.colRole")}</th>
                <th>{t("ops.colConnected")}</th>
                <th>{t("ops.colJoined")}</th>
                <th>{t("ops.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div>
                      <strong>{user.displayName}</strong>
                      <br />
                      <span className="muted">{user.emailOrUsername}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`status-chip ${getRoleChipClass(user.role)}`}>
                      {t(`ops.roles.${user.role}`) || user.role}
                    </span>
                  </td>
                  <td className="muted">
                    {user.redmineBaseUrl ?? t("ops.notConnected")}
                  </td>
                  <td className="muted">
                    {formatDate(user.createdAt)}
                  </td>
                  <td>
                    {user.id !== currentUserId && (
                      <div className="row-actions">
                        {(["Administrator", "Editor", "User", "Viewer"] as const).map((role) => (
                          <button
                            key={role}
                            className="secondary-button"
                            disabled={updating === user.id || user.role === role}
                            onClick={() => updateRole(user.id, role)}
                          >
                            {t(`ops.roles.${role}`)}
                          </button>
                        ))}
                      </div>
                    )}
                    {user.id === currentUserId && (
                      <span className="muted">{t("ops.you")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function getRoleChipClass(role: string): string {
  switch (role) {
    case "Administrator": return "sync-success";
    case "Editor": return "status-chip";
    case "User": return "muted";
    case "Viewer": return "sync-failed";
    default: return "";
  }
}
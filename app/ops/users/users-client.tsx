"use client";

import { useState } from "react";

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
        alert(data.error ?? "Failed to update role");
        return;
      }
      
      const data = await res.json();
      setUsers(users.map(u => 
        u.id === userId ? { ...u, role: data.user.role } : u
      ));
    } catch (e) {
      alert("Failed to update role");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Administration</p>
            <h1>User Management</h1>
            <p className="muted">Manage user roles and permissions</p>
          </div>
          <div className="hero-actions">
            <a href="/ops" className="secondary-button">
              ← Back to Ops
            </a>
          </div>
        </div>
      </header>

      <section className="card">
        <div className="table-toolbar">
          <h2>All Users</h2>
          <p className="muted">{users.length} users</p>
        </div>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Connected Redmine</th>
                <th>Joined</th>
                <th>Actions</th>
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
                      {user.role}
                    </span>
                  </td>
                  <td className="muted">
                    {user.redmineBaseUrl ?? "Not connected"}
                  </td>
                  <td className="muted">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    {user.id !== currentUserId && (
                      <div className="row-actions">
                        <button
                          className="secondary-button"
                          disabled={updating === user.id || user.role === "Administrator"}
                          onClick={() => updateRole(user.id, "Administrator")}
                        >
                          Admin
                        </button>
                        <button
                          className="secondary-button"
                          disabled={updating === user.id || user.role === "Editor"}
                          onClick={() => updateRole(user.id, "Editor")}
                        >
                          Editor
                        </button>
                        <button
                          className="secondary-button"
                          disabled={updating === user.id || user.role === "User"}
                          onClick={() => updateRole(user.id, "User")}
                        >
                          User
                        </button>
                        <button
                          className="secondary-button"
                          disabled={updating === user.id || user.role === "Viewer"}
                          onClick={() => updateRole(user.id, "Viewer")}
                        >
                          Viewer
                        </button>
                      </div>
                    )}
                    {user.id === currentUserId && (
                      <span className="muted">(You)</span>
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
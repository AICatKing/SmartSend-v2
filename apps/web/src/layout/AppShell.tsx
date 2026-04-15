import { NavLink, Outlet } from "react-router-dom";
import { useMemo, useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage } from "../lib/format";

const navItems = [
  { to: "/workspace-config", label: "发件配置" },
  { to: "/contacts", label: "联系人" },
  { to: "/templates", label: "模板" },
  { to: "/campaigns", label: "活动" },
];

function NavItem(props: { to: string; label: string }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        isActive ? "nav-link nav-link-active" : "nav-link"
      }
    >
      {props.label}
    </NavLink>
  );
}

export function AppShell() {
  const { session, switchWorkspace, logout } = useAppContext();
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState("");

  const userLabel = useMemo(() => {
    if (!session) {
      return "-";
    }

    return `${session.user.email} (${session.currentWorkspaceRole})`;
  }, [session]);

  if (!session) {
    return null;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div>
          <h1>SmartSend</h1>
          <p>正式前端应用</p>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <strong>当前用户</strong>
            <div className="muted">{userLabel}</div>
          </div>
          <div className="top-actions">
            <label className="workspace-switcher">
              工作区
              <select
                disabled={switching}
                value={session.currentWorkspaceId}
                onChange={async (event) => {
                  setSwitching(true);
                  setMessage("");
                  try {
                    await switchWorkspace(event.target.value);
                    setMessage("工作区已切换。");
                  } catch (error) {
                    setMessage(asErrorMessage(error));
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                {session.workspaces.map((item) => (
                  <option key={item.workspaceId} value={item.workspaceId}>
                    {item.workspaceName} ({item.role})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                void logout();
              }}
            >
              退出登录
            </button>
          </div>
        </header>

        {message ? <p className="status-text">{message}</p> : null}

        <Outlet />
      </main>
    </div>
  );
}

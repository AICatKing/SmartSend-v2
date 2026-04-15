import { NavLink, Outlet } from "react-router-dom";
import { useMemo, useState } from "react";

import { useAppContext } from "../lib/app-context";

const navItems = [
  { to: "/workspace-config", label: "Workspace Config" },
  { to: "/contacts", label: "Contacts" },
  { to: "/templates", label: "Templates" },
  { to: "/campaigns", label: "Campaigns" },
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
  const { devContext, setDevContext } = useAppContext();
  const [showContext, setShowContext] = useState(false);
  const [draft, setDraft] = useState(devContext);

  const workspaceLabel = useMemo(() => {
    return `${devContext.workspaceId} / ${devContext.userId}`;
  }, [devContext]);

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div>
          <h1>SmartSend</h1>
          <p>Product Web App</p>
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
            <strong>Active Context</strong>
            <div className="muted">{workspaceLabel}</div>
          </div>
          <button type="button" onClick={() => setShowContext((v) => !v)}>
            {showContext ? "Hide Dev Context" : "Edit Dev Context"}
          </button>
        </header>

        {showContext ? (
          <section className="card context-card">
            <div className="form-grid two-col">
              <label>
                User ID
                <input
                  value={draft.userId}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, userId: event.target.value }))
                  }
                />
              </label>
              <label>
                Workspace ID
                <input
                  value={draft.workspaceId}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, workspaceId: event.target.value }))
                  }
                />
              </label>
              <label>
                User Email
                <input
                  value={draft.userEmail}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, userEmail: event.target.value }))
                  }
                />
              </label>
              <label>
                User Name
                <input
                  value={draft.userName}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, userName: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setDevContext({
                    ...draft,
                    userId: draft.userId.trim(),
                    workspaceId: draft.workspaceId.trim(),
                    userEmail: draft.userEmail.trim(),
                    userName: draft.userName.trim(),
                  });
                }}
              >
                Save Context
              </button>
            </div>
          </section>
        ) : null}

        <Outlet />
      </main>
    </div>
  );
}

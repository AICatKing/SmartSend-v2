import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="card">
      <h2>SmartSend v2 Product Frontend</h2>
      <p className="muted">
        Minimal product loop for current backend phase.
      </p>
      <ol>
        <li>
          Configure sender in <Link to="/workspace-config">Workspace Config</Link>
        </li>
        <li>
          Manage recipients in <Link to="/contacts">Contacts</Link>
        </li>
        <li>
          Create email template in <Link to="/templates">Templates</Link>
        </li>
        <li>
          Create draft, queue campaign, and track progress in <Link to="/campaigns">Campaigns</Link>
        </li>
      </ol>
    </section>
  );
}

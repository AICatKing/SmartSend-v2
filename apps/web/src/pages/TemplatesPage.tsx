import { useEffect, useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage } from "../lib/format";

type TemplateForm = {
  name: string;
  subject: string;
  bodyHtml: string;
};

const defaultForm: TemplateForm = {
  name: "",
  subject: "",
  bodyHtml: "",
};

export function TemplatesPage() {
  const { apiClient } = useAppContext();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof apiClient.listTemplates>>["items"]>([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadTemplates() {
    setLoading(true);
    setMessage("");
    try {
      const output = await apiClient.listTemplates();
      setTemplates(output.items);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function createTemplate() {
    setLoading(true);
    setMessage("");
    try {
      await apiClient.createTemplate(form);
      setForm(defaultForm);
      await loadTemplates();
      setMessage("Template created.");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function removeTemplate(templateId: string) {
    setLoading(true);
    setMessage("");
    try {
      await apiClient.removeTemplate(templateId);
      await loadTemplates();
      setMessage(`Deleted template ${templateId}.`);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  return (
    <section className="card">
      <h2>Templates</h2>
      <p className="muted">Create reusable email content for campaign drafts.</p>
      <div className="form-grid two-col">
        <label>
          Name
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label>
          Subject
          <input
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
          />
        </label>
        <label className="span-all">
          Body HTML
          <textarea
            rows={8}
            value={form.bodyHtml}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, bodyHtml: event.target.value }))
            }
            placeholder="<p>Hello {{name}}</p>"
          />
        </label>
      </div>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void createTemplate()}>
          Create Template
        </button>
        <button disabled={loading} type="button" onClick={() => void loadTemplates()}>
          Refresh
        </button>
      </div>
      {message ? <p className="status-text">{message}</p> : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Subject</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.subject}</td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
                <td>
                  <button
                    className="danger"
                    type="button"
                    disabled={loading}
                    onClick={() => void removeTemplate(item.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  No templates.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

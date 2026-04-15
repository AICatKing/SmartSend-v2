import { useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage } from "../lib/format";

type FormState = {
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  apiKey: string;
};

const defaultForm: FormState = {
  fromEmail: "",
  fromName: "",
  replyToEmail: "",
  apiKey: "",
};

export function WorkspaceConfigPage() {
  const { apiClient } = useAppContext();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadConfig() {
    setLoading(true);
    setMessage("");
    try {
      const output = await apiClient.getWorkspaceSendingConfig();
      if (!output.config) {
        setMessage("No sending config in this workspace yet.");
        setForm(defaultForm);
        return;
      }

      setForm({
        fromEmail: output.config.fromEmail,
        fromName: output.config.fromName,
        replyToEmail: output.config.replyToEmail ?? "",
        apiKey: "",
      });
      setMessage(`Loaded config (hasApiKey=${output.config.hasApiKey ? "yes" : "no"})`);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setLoading(true);
    setMessage("");
    try {
      await apiClient.upsertWorkspaceSendingConfig({
        provider: "resend",
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        replyToEmail: form.replyToEmail.trim() || undefined,
        apiKey: form.apiKey.trim() || undefined,
      });
      setForm((prev) => ({ ...prev, apiKey: "" }));
      setMessage("Workspace sending config updated.");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Workspace Sending Config</h2>
      <p className="muted">Configure sender identity and provider key at workspace level.</p>
      <div className="form-grid two-col">
        <label>
          Provider
          <input value="resend" disabled />
        </label>
        <label>
          From Email
          <input
            type="email"
            value={form.fromEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fromEmail: event.target.value }))
            }
          />
        </label>
        <label>
          From Name
          <input
            value={form.fromName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fromName: event.target.value }))
            }
          />
        </label>
        <label>
          Reply-To Email (optional)
          <input
            type="email"
            value={form.replyToEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, replyToEmail: event.target.value }))
            }
          />
        </label>
        <label>
          API Key (leave blank to keep existing)
          <input
            type="password"
            value={form.apiKey}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, apiKey: event.target.value }))
            }
          />
        </label>
      </div>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void loadConfig()}>
          Load Config
        </button>
        <button disabled={loading} type="button" onClick={() => void saveConfig()}>
          Save Config
        </button>
      </div>
      {message ? <p className="status-text">{message}</p> : null}
    </section>
  );
}

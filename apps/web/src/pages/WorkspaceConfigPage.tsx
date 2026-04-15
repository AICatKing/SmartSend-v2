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
        setMessage("当前 workspace 还没有发件配置。");
        setForm(defaultForm);
        return;
      }

      setForm({
        fromEmail: output.config.fromEmail,
        fromName: output.config.fromName,
        replyToEmail: output.config.replyToEmail ?? "",
        apiKey: "",
      });
      setMessage(`已加载配置（已配置 API Key：${output.config.hasApiKey ? "是" : "否"}）`);
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
      setMessage("发件配置已更新。");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>发件配置</h2>
      <p className="muted">在 workspace 级别配置发件身份与服务商密钥。</p>
      <div className="form-grid two-col">
        <label>
          服务商
          <input value="resend" disabled />
        </label>
        <label>
          发件邮箱
          <input
            type="email"
            value={form.fromEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fromEmail: event.target.value }))
            }
          />
        </label>
        <label>
          发件人名称
          <input
            value={form.fromName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fromName: event.target.value }))
            }
          />
        </label>
        <label>
          Reply-To 邮箱（可选）
          <input
            type="email"
            value={form.replyToEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, replyToEmail: event.target.value }))
            }
          />
        </label>
        <label>
          API Key（留空表示保持不变）
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
          读取配置
        </button>
        <button disabled={loading} type="button" onClick={() => void saveConfig()}>
          保存配置
        </button>
      </div>
      {message ? <p className="status-text">{message}</p> : null}
    </section>
  );
}

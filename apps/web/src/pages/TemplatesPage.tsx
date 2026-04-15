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
      setMessage("模板已创建。");
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
      setMessage(`已删除模板 ${templateId}。`);
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
      <h2>模板</h2>
      <p className="muted">创建可复用的邮件内容，用于 campaign 草稿。</p>
      <div className="form-grid two-col">
        <label>
          模板名称
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label>
          主题
          <input
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
          />
        </label>
        <label className="span-all">
          正文 HTML
          <textarea
            rows={8}
            value={form.bodyHtml}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, bodyHtml: event.target.value }))
            }
            placeholder="<p>你好 {{name}}</p>"
          />
        </label>
      </div>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void createTemplate()}>
          创建模板
        </button>
        <button disabled={loading} type="button" onClick={() => void loadTemplates()}>
          刷新
        </button>
      </div>
      {message ? <p className="status-text">{message}</p> : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>模板名称</th>
              <th>主题</th>
              <th>更新时间</th>
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
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  暂无模板。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

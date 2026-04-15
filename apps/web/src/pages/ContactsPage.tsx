import { useEffect, useMemo, useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage } from "../lib/format";

type ContactForm = {
  email: string;
  name: string;
  company: string;
  groupName: string;
  customFieldsJson: string;
};

const defaultForm: ContactForm = {
  email: "",
  name: "",
  company: "",
  groupName: "",
  customFieldsJson: "",
};

export function ContactsPage() {
  const { apiClient } = useAppContext();
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof apiClient.listContacts>>["items"]>([]);
  const [form, setForm] = useState<ContactForm>(defaultForm);
  const [importJson, setImportJson] = useState("[");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const groups = useMemo(() => {
    return Array.from(new Set(contacts.map((item) => item.groupName).filter(Boolean))).join(", ");
  }, [contacts]);

  async function loadContacts() {
    setLoading(true);
    setMessage("");
    try {
      const output = await apiClient.listContacts();
      setContacts(output.items);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function createContact() {
    setLoading(true);
    setMessage("");
    try {
      const customFields = form.customFieldsJson.trim()
        ? (JSON.parse(form.customFieldsJson) as Record<string, unknown>)
        : {};

      await apiClient.createContact({
        email: form.email,
        name: form.name,
        company: form.company.trim() || undefined,
        groupName: form.groupName.trim() || undefined,
        customFields,
      });

      setForm(defaultForm);
      await loadContacts();
      setMessage("联系人已创建。");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function bulkImport() {
    setLoading(true);
    setMessage("");
    try {
      const parsed = JSON.parse(importJson) as unknown[];
      await apiClient.importContacts(parsed);
      await loadContacts();
      setMessage(`已导入 ${parsed.length} 个联系人。`);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function removeContact(contactId: string) {
    setLoading(true);
    setMessage("");
    try {
      await apiClient.removeContact(contactId);
      await loadContacts();
      setMessage(`已删除联系人 ${contactId}。`);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts();
  }, []);

  return (
    <section className="card">
      <h2>联系人</h2>
      <p className="muted">创建并导入用于 campaign 入队发送的收件人。</p>
      <div className="form-grid three-col">
        <label>
          邮箱
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </label>
        <label>
          姓名
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label>
          公司
          <input
            value={form.company}
            onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
          />
        </label>
        <label>
          分组
          <input
            value={form.groupName}
            placeholder={groups || "示例分组"}
            onChange={(event) => setForm((prev) => ({ ...prev, groupName: event.target.value }))}
          />
        </label>
        <label className="span-two">
          自定义字段 JSON
          <input
            placeholder='{"title":"工程师"}'
            value={form.customFieldsJson}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, customFieldsJson: event.target.value }))
            }
          />
        </label>
      </div>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void createContact()}>
          创建联系人
        </button>
        <button disabled={loading} type="button" onClick={() => void loadContacts()}>
          刷新
        </button>
      </div>

      <label>
        批量导入 JSON 数组
        <textarea
          rows={5}
          value={importJson}
          onChange={(event) => setImportJson(event.target.value)}
          placeholder='[{"email":"a@example.com","name":"张三"}]'
        />
      </label>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void bulkImport()}>
          导入联系人
        </button>
      </div>

      {message ? <p className="status-text">{message}</p> : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>邮箱</th>
              <th>姓名</th>
              <th>分组</th>
              <th>公司</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((item) => (
              <tr key={item.id}>
                <td>{item.email}</td>
                <td>{item.name}</td>
                <td>{item.groupName ?? "-"}</td>
                <td>{item.company ?? "-"}</td>
                <td>
                  <button
                    className="danger"
                    type="button"
                    disabled={loading}
                    onClick={() => void removeContact(item.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  暂无联系人。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

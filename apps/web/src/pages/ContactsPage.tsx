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
      setMessage("Contact created.");
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
      setMessage(`Imported ${parsed.length} contacts.`);
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
      setMessage(`Deleted contact ${contactId}.`);
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
      <h2>Contacts</h2>
      <p className="muted">Create and import recipients used by campaign queueing.</p>
      <div className="form-grid three-col">
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </label>
        <label>
          Name
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label>
          Company
          <input
            value={form.company}
            onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
          />
        </label>
        <label>
          Group
          <input
            value={form.groupName}
            placeholder={groups || "example-group"}
            onChange={(event) => setForm((prev) => ({ ...prev, groupName: event.target.value }))}
          />
        </label>
        <label className="span-two">
          Custom Fields JSON
          <input
            placeholder='{"title":"Engineer"}'
            value={form.customFieldsJson}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, customFieldsJson: event.target.value }))
            }
          />
        </label>
      </div>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void createContact()}>
          Create Contact
        </button>
        <button disabled={loading} type="button" onClick={() => void loadContacts()}>
          Refresh
        </button>
      </div>

      <label>
        Bulk Import JSON Array
        <textarea
          rows={5}
          value={importJson}
          onChange={(event) => setImportJson(event.target.value)}
          placeholder='[{"email":"a@example.com","name":"A"}]'
        />
      </label>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void bulkImport()}>
          Import Contacts
        </button>
      </div>

      {message ? <p className="status-text">{message}</p> : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Group</th>
              <th>Company</th>
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
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  No contacts.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CONTEXT_STORAGE_KEY = "smartsend-v2.dev-context";

const defaultContext = {
  userId: "user_local_owner",
  workspaceId: "ws_local_demo",
  userEmail: "local-owner@example.com",
  userName: "Local Owner",
};

let state = {
  context: loadContext(),
  contacts: [],
  templates: [],
  campaigns: [],
  progressPollTimer: null,
};

bindContextForm();
bindSendingConfigPanel();
bindContactsPanel();
bindTemplatesPanel();
bindCampaignPanel();

refreshAll().catch((error) => {
  logEvent(`initial refresh failed: ${formatError(error)}`);
});

function bindContextForm() {
  setValue("auth-user-id", state.context.userId);
  setValue("auth-workspace-id", state.context.workspaceId);
  setValue("auth-user-email", state.context.userEmail);
  setValue("auth-user-name", state.context.userName);

  onClick("auth-save", () => {
    state.context = {
      userId: getValue("auth-user-id").trim(),
      workspaceId: getValue("auth-workspace-id").trim(),
      userEmail: getValue("auth-user-email").trim(),
      userName: getValue("auth-user-name").trim(),
    };
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(state.context));
    logEvent(`saved context user=${state.context.userId} workspace=${state.context.workspaceId}`);
  });
}

function bindSendingConfigPanel() {
  onClick("cfg-load", loadSendingConfig);

  onClick("cfg-save", async () => {
    const payload = {
      provider: "resend",
      fromEmail: getValue("cfg-from-email").trim(),
      fromName: getValue("cfg-from-name").trim(),
      replyToEmail: normalizeOptional(getValue("cfg-reply-to")),
      apiKey: normalizeOptional(getValue("cfg-api-key")),
    };

    await apiFetch("/api/workspace-sending-config", {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    setValue("cfg-api-key", "");
    logEvent("workspace sending config upserted");
    await refreshCampaignDependencies();
  });
}

async function loadSendingConfig() {
  const output = await apiFetch("/api/workspace-sending-config");
  const cfg = output.config;

  if (!cfg) {
    logEvent("workspace sending config is empty");
    return;
  }

  setValue("cfg-from-email", cfg.fromEmail || "");
  setValue("cfg-from-name", cfg.fromName || "");
  setValue("cfg-reply-to", cfg.replyToEmail || "");
  setValue("cfg-api-key", "");
  logEvent(`loaded workspace sending config (hasApiKey=${cfg.hasApiKey})`);
}

function bindContactsPanel() {
  onClick("contact-create", async () => {
    const customFieldsRaw = getValue("contact-custom-fields").trim();
    const customFields = customFieldsRaw ? JSON.parse(customFieldsRaw) : {};

    await apiFetch("/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        email: getValue("contact-email").trim(),
        name: getValue("contact-name").trim(),
        company: normalizeOptional(getValue("contact-company")),
        groupName: normalizeOptional(getValue("contact-group")),
        customFields,
      }),
    });

    clearValues([
      "contact-email",
      "contact-name",
      "contact-company",
      "contact-group",
      "contact-custom-fields",
    ]);
    logEvent("contact created");
    await refreshContacts();
  });

  onClick("contact-refresh", refreshContacts);

  onClick("contact-import", async () => {
    const raw = getValue("contact-import-json").trim();
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("import payload must be a JSON array");
    }

    await apiFetch("/api/contacts/import", {
      method: "POST",
      body: JSON.stringify({ contacts: parsed }),
    });

    logEvent(`imported ${parsed.length} contacts`);
    await refreshContacts();
  });
}

function bindTemplatesPanel() {
  onClick("tpl-create", async () => {
    await apiFetch("/api/templates", {
      method: "POST",
      body: JSON.stringify({
        name: getValue("tpl-name").trim(),
        subject: getValue("tpl-subject").trim(),
        bodyHtml: getValue("tpl-body").trim(),
      }),
    });

    clearValues(["tpl-name", "tpl-subject", "tpl-body"]);
    logEvent("template created");
    await refreshTemplates();
  });

  onClick("tpl-refresh", refreshTemplates);
}

function bindCampaignPanel() {
  onClick("camp-create", async () => {
    const targetType = getValue("camp-target-type");
    const target =
      targetType === "group_name"
        ? {
            type: "group_name",
            groupName: getValue("camp-target-group").trim(),
          }
        : { type: "all_contacts" };

    await apiFetch("/api/campaigns/drafts", {
      method: "POST",
      body: JSON.stringify({
        name: getValue("camp-name").trim(),
        templateId: getValue("camp-template-id"),
        target,
      }),
    });

    setValue("camp-name", "");
    logEvent("campaign draft created");
    await refreshCampaigns();
  });

  onClick("camp-refresh", refreshCampaigns);

  onClick("camp-queue", async () => {
    const campaignId = getValue("camp-selected-id");

    await apiFetch(`/api/campaigns/${campaignId}/queue`, {
      method: "POST",
      body: JSON.stringify({
        maxAttempts: Number(getValue("camp-max-attempts")),
      }),
    });

    logEvent(`campaign queued: ${campaignId}`);
    await refreshCampaigns();
    await loadCampaignProgress();
  });

  onClick("camp-progress", loadCampaignProgress);
  onClick("camp-send-jobs", loadSendJobs);
  onClick("camp-failures", loadRecentFailures);

  document.getElementById("camp-auto-poll")?.addEventListener("change", () => {
    restartProgressPolling();
  });

  document.getElementById("camp-selected-id")?.addEventListener("change", () => {
    restartProgressPolling();
  });
}

async function refreshAll() {
  await Promise.all([refreshContacts(), refreshTemplates(), refreshCampaigns(), loadSendingConfig()]);
}

async function refreshCampaignDependencies() {
  await Promise.all([refreshTemplates(), refreshCampaigns()]);
}

async function refreshContacts() {
  const output = await apiFetch("/api/contacts");
  state.contacts = output.items || [];
  renderContactsTable();
  renderGroupHints();
}

async function refreshTemplates() {
  const output = await apiFetch("/api/templates");
  state.templates = output.items || [];
  renderTemplatesTable();
  renderTemplateSelects();
}

async function refreshCampaigns() {
  const output = await apiFetch("/api/campaigns");
  state.campaigns = output.items || [];
  renderCampaignsTable();
  renderCampaignSelect();
}

async function loadCampaignProgress() {
  const campaignId = getValue("camp-selected-id");
  if (!campaignId) {
    return;
  }

  const output = await apiFetch(`/api/campaigns/${campaignId}/progress`);
  renderProgress(output);
}

async function loadSendJobs() {
  const campaignId = getValue("camp-selected-id");
  if (!campaignId) {
    return;
  }

  const output = await apiFetch(`/api/campaigns/${campaignId}/send-jobs`);
  renderSendJobsTable(output.items || []);
}

async function loadRecentFailures() {
  const campaignId = getValue("camp-selected-id");
  if (!campaignId) {
    return;
  }

  const output = await apiFetch(
    `/api/campaigns/${campaignId}/recent-failures`,
  );
  renderFailuresTable(output.items || []);
}

function renderContactsTable() {
  renderTable(
    "contacts-table",
    ["id", "email", "name", "groupName", "company", "actions"],
    state.contacts.map((item) => ({
      id: item.id,
      email: item.email,
      name: item.name,
      groupName: item.groupName || "",
      company: item.company || "",
      actions: `<button class=\"danger\" data-delete-contact=\"${escapeHtml(item.id)}\">Delete</button>`,
    })),
  );

  document.querySelectorAll("[data-delete-contact]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.getAttribute("data-delete-contact");
      if (!id) {
        return;
      }

      await apiFetch(`/api/contacts/${id}`, { method: "DELETE" });
      logEvent(`contact deleted: ${id}`);
      await refreshContacts();
    });
  });
}

function renderTemplatesTable() {
  renderTable(
    "templates-table",
    ["id", "name", "subject", "actions"],
    state.templates.map((item) => ({
      id: item.id,
      name: item.name,
      subject: item.subject,
      actions: `<button class=\"danger\" data-delete-template=\"${escapeHtml(item.id)}\">Delete</button>`,
    })),
  );

  document.querySelectorAll("[data-delete-template]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.getAttribute("data-delete-template");
      if (!id) {
        return;
      }

      await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
      logEvent(`template deleted: ${id}`);
      await refreshTemplates();
    });
  });
}

function renderCampaignsTable() {
  renderTable(
    "campaigns-table",
    ["id", "name", "status", "templateId", "target", "queuedAt"],
    state.campaigns.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      templateId: item.templateId,
      target:
        item.target?.type === "group_name"
          ? `group_name:${item.target.groupName}`
          : item.target?.type || "",
      queuedAt: item.queuedAt || "",
    })),
  );
}

function renderProgress(progress) {
  const mount = document.getElementById("campaign-progress");
  if (!mount) {
    return;
  }

  const metrics = [
    ["Campaign", progress.campaignId],
    ["Campaign Status", progress.status],
    ["Total", progress.total],
    ["Pending", progress.pending],
    ["Processing", progress.processing],
    ["Sent", progress.sent],
    ["Failed", progress.failed],
    ["Cancelled", progress.cancelled],
  ];

  mount.innerHTML = metrics
    .map(
      ([label, value]) =>
        `<div class=\"kv-item\"><span class=\"kv-label\">${escapeHtml(String(label))}</span><span class=\"kv-value\">${escapeHtml(String(value))}</span></div>`,
    )
    .join("");
}

function renderSendJobsTable(items) {
  renderTable(
    "send-jobs-table",
    ["id", "status", "recipientEmail", "attemptCount", "maxAttempts", "scheduledAt", "lastErrorCode"],
    items.map((item) => ({
      id: item.id,
      status: item.status,
      recipientEmail: item.recipientEmail,
      attemptCount: item.attemptCount,
      maxAttempts: item.maxAttempts,
      scheduledAt: item.scheduledAt,
      lastErrorCode: item.lastErrorCode || "",
    })),
  );
}

function renderFailuresTable(items) {
  renderTable(
    "failures-table",
    ["deliveryAttemptId", "sendJobId", "recipientEmail", "sendJobStatus", "errorCode", "completedAt"],
    items.map((item) => ({
      deliveryAttemptId: item.deliveryAttemptId,
      sendJobId: item.sendJobId,
      recipientEmail: item.recipientEmail,
      sendJobStatus: item.sendJobStatus,
      errorCode: item.errorCode || "",
      completedAt: item.completedAt,
    })),
  );
}

function renderTemplateSelects() {
  const templateSelect = document.getElementById("camp-template-id");
  if (!templateSelect) {
    return;
  }

  templateSelect.innerHTML = state.templates
    .map((item) => `<option value=\"${escapeHtml(item.id)}\">${escapeHtml(item.name)} (${escapeHtml(item.id)})</option>`)
    .join("");
}

function renderCampaignSelect() {
  const selected = getValue("camp-selected-id");
  const select = document.getElementById("camp-selected-id");
  if (!select) {
    return;
  }

  select.innerHTML = state.campaigns
    .map((item) => `<option value=\"${escapeHtml(item.id)}\">${escapeHtml(item.name)} | ${escapeHtml(item.status)} | ${escapeHtml(item.id)}</option>`)
    .join("");

  if (selected && state.campaigns.some((item) => item.id === selected)) {
    setValue("camp-selected-id", selected);
  }
}

function renderGroupHints() {
  const groupNames = [...new Set(state.contacts.map((item) => item.groupName).filter(Boolean))];
  const targetInput = document.getElementById("camp-target-group");
  if (targetInput) {
    targetInput.setAttribute("placeholder", groupNames.join(", ") || "example-group");
  }
}

function restartProgressPolling() {
  if (state.progressPollTimer) {
    window.clearInterval(state.progressPollTimer);
    state.progressPollTimer = null;
  }

  const ms = Number(getValue("camp-auto-poll"));
  const campaignId = getValue("camp-selected-id");

  if (!ms || !campaignId) {
    return;
  }

  state.progressPollTimer = window.setInterval(() => {
    loadCampaignProgress().catch((error) => {
      logEvent(`progress poll failed: ${formatError(error)}`);
    });
  }, ms);
}

function renderTable(mountId, headers, rows) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    return;
  }

  if (!rows.length) {
    mount.innerHTML = "<p class=\"hint\">No rows.</p>";
    return;
  }

  mount.innerHTML = `<table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${headers
          .map((header) =>
            header === "actions"
              ? `<td>${row[header] ?? ""}</td>`
              : `<td>${escapeHtml(String(row[header] ?? ""))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-dev-user-id": state.context.userId,
      "x-dev-workspace-id": state.context.workspaceId,
      ...(state.context.userEmail ? { "x-dev-user-email": state.context.userEmail } : {}),
      ...(state.context.userName ? { "x-dev-user-name": state.context.userName } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response
    .json()
    .catch(() => ({ error: { code: "UNKNOWN", message: response.statusText } }));

  if (!response.ok) {
    const message = data?.error?.message || `request failed: ${response.status}`;
    logEvent(`${path} failed: ${message}`);
    throw new Error(message);
  }

  return data;
}

function loadContext() {
  const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
  if (!raw) {
    return { ...defaultContext };
  }

  try {
    return { ...defaultContext, ...JSON.parse(raw) };
  } catch {
    return { ...defaultContext };
  }
}

function logEvent(message) {
  const output = document.getElementById("events");
  if (!output) {
    return;
  }

  const line = `[${new Date().toISOString()}] ${message}`;
  output.textContent = `${line}\n${output.textContent}`.slice(0, 12000);
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function onClick(id, handler) {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }

  node.addEventListener("click", () => {
    Promise.resolve(handler()).catch((error) => {
      logEvent(`${id} failed: ${formatError(error)}`);
    });
  });
}

function getValue(id) {
  const node = document.getElementById(id);
  return node && "value" in node ? String(node.value) : "";
}

function setValue(id, value) {
  const node = document.getElementById(id);
  if (node && "value" in node) {
    node.value = value;
  }
}

function clearValues(ids) {
  ids.forEach((id) => setValue(id, ""));
}

function normalizeOptional(value) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

import {
  campaignCreateDraftInputSchema,
  campaignCreateDraftOutputSchema,
  campaignListOutputSchema,
  campaignListRecentFailuresOutputSchema,
  campaignListSendJobsOutputSchema,
  campaignProgressOutputSchema,
  campaignQueueInputSchema,
  campaignQueueOutputSchema,
  contactCreateDataSchema,
  contactCreateOutputSchema,
  contactImportOutputSchema,
  contactListOutputSchema,
  contactRemoveOutputSchema,
  templateCreateDataSchema,
  templateCreateOutputSchema,
  templateListOutputSchema,
  templateRemoveOutputSchema,
  workspaceSendingConfigGetOutputSchema,
  workspaceSendingConfigUpsertInputSchema,
  workspaceSendingConfigUpsertOutputSchema,
} from "@smartsend/contracts";
import type { DevContext } from "./dev-context";

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type CampaignCreateInput = Pick<
  ReturnType<typeof campaignCreateDraftInputSchema.parse>,
  "name" | "templateId" | "target"
>;

export type CampaignQueueInput = Pick<
  ReturnType<typeof campaignQueueInputSchema.parse>,
  "maxAttempts"
>;

export type SendingConfigInput = Omit<
  ReturnType<typeof workspaceSendingConfigUpsertInputSchema.parse>,
  "workspaceId"
>;

const defaultJsonHeaders = {
  "content-type": "application/json",
};

export class ApiClient {
  constructor(private readonly getContext: () => DevContext) {}

  async getWorkspaceSendingConfig() {
    const data = await this.request("/api/workspace-sending-config");
    return workspaceSendingConfigGetOutputSchema.parse(data);
  }

  async upsertWorkspaceSendingConfig(input: SendingConfigInput) {
    const body = workspaceSendingConfigUpsertInputSchema
      .omit({ workspaceId: true })
      .parse(input);

    const data = await this.request("/api/workspace-sending-config", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: defaultJsonHeaders,
    });

    return workspaceSendingConfigUpsertOutputSchema.parse(data);
  }

  async listContacts() {
    const data = await this.request("/api/contacts");
    return contactListOutputSchema.parse(data);
  }

  async createContact(contact: unknown) {
    const body = contactCreateDataSchema.parse(contact);
    const data = await this.request("/api/contacts", {
      method: "POST",
      body: JSON.stringify(body),
      headers: defaultJsonHeaders,
    });

    return contactCreateOutputSchema.parse(data);
  }

  async importContacts(contacts: unknown[]) {
    const data = await this.request("/api/contacts/import", {
      method: "POST",
      body: JSON.stringify({ contacts }),
      headers: defaultJsonHeaders,
    });

    return contactImportOutputSchema.parse(data);
  }

  async removeContact(contactId: string) {
    const data = await this.request(`/api/contacts/${contactId}`, {
      method: "DELETE",
    });

    return contactRemoveOutputSchema.parse(data);
  }

  async listTemplates() {
    const data = await this.request("/api/templates");
    return templateListOutputSchema.parse(data);
  }

  async createTemplate(template: unknown) {
    const body = templateCreateDataSchema.parse(template);

    const data = await this.request("/api/templates", {
      method: "POST",
      body: JSON.stringify(body),
      headers: defaultJsonHeaders,
    });

    return templateCreateOutputSchema.parse(data);
  }

  async removeTemplate(templateId: string) {
    const data = await this.request(`/api/templates/${templateId}`, {
      method: "DELETE",
    });

    return templateRemoveOutputSchema.parse(data);
  }

  async listCampaigns() {
    const data = await this.request("/api/campaigns");
    return campaignListOutputSchema.parse(data);
  }

  async createCampaignDraft(input: CampaignCreateInput) {
    const body = campaignCreateDraftInputSchema
      .omit({ workspaceId: true })
      .parse(input);

    const data = await this.request("/api/campaigns/drafts", {
      method: "POST",
      body: JSON.stringify(body),
      headers: defaultJsonHeaders,
    });

    return campaignCreateDraftOutputSchema.parse(data);
  }

  async queueCampaign(campaignId: string, input: CampaignQueueInput) {
    const body = campaignQueueInputSchema
      .pick({ maxAttempts: true })
      .parse(input);

    const data = await this.request(`/api/campaigns/${campaignId}/queue`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: defaultJsonHeaders,
    });

    return campaignQueueOutputSchema.parse(data);
  }

  async getCampaignProgress(campaignId: string) {
    const data = await this.request(`/api/campaigns/${campaignId}/progress`);
    return campaignProgressOutputSchema.parse(data);
  }

  async listCampaignSendJobs(campaignId: string) {
    const data = await this.request(`/api/campaigns/${campaignId}/send-jobs`);
    return campaignListSendJobsOutputSchema.parse(data);
  }

  async listCampaignRecentFailures(campaignId: string) {
    const data = await this.request(`/api/campaigns/${campaignId}/recent-failures`);
    return campaignListRecentFailuresOutputSchema.parse(data);
  }

  private async request(path: string, init: RequestInit = {}) {
    const context = this.getContext();
    const response = await fetch(path, {
      ...init,
      headers: {
        "x-dev-user-id": context.userId,
        "x-dev-workspace-id": context.workspaceId,
        ...(context.userEmail ? { "x-dev-user-email": context.userEmail } : {}),
        ...(context.userName ? { "x-dev-user-name": context.userName } : {}),
        ...(init.headers ?? {}),
      },
    });

    const data = await response
      .json()
      .catch(() => ({ error: { message: response.statusText } }));

    if (!response.ok) {
      throw new ApiClientError(
        data?.error?.message ?? `Request failed: ${response.status}`,
        response.status,
        data?.error?.code,
      );
    }

    return data;
  }
}

import type { Provider, ProviderErrorClassification } from "./provider.js";

export type ProviderSendInput = {
  encryptedApiKey: string;
  fromEmail: string;
  fromName: string;
  html: string;
  provider: Provider;
  recipientEmail: string;
  recipientName: string;
  replyToEmail?: string | null;
  subject: string;
  workspaceId: string;
};

export type ProviderSendSuccess = {
  ok: true;
  provider: Provider;
  providerMessageId?: string;
  responsePayloadJson?: Record<string, unknown>;
};

export type ProviderSendFailure = {
  ok: false;
  classification: ProviderErrorClassification;
  errorCode?: string;
  errorMessage?: string;
  provider: Provider;
  responsePayloadJson?: Record<string, unknown>;
};

export type ProviderSendResult = ProviderSendSuccess | ProviderSendFailure;

export interface ProviderAdapter {
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

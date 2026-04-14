import { formatUnknownError, type SecretBox } from "@smartsend/shared";
import type { ProviderAdapter, ProviderSendInput, ProviderSendResult } from "@smartsend/domain";

export type ProviderMode = "mock" | "resend";

type CreateResendProviderAdapterOptions = {
  mode: ProviderMode;
  secretBox: SecretBox;
};

type ResendSuccessResponse = {
  id?: string;
};

export function createResendProviderAdapter(
  options: CreateResendProviderAdapterOptions,
): ProviderAdapter {
  return {
    async send(input: ProviderSendInput): Promise<ProviderSendResult> {
      const apiKey = options.secretBox.decrypt(input.encryptedApiKey);

      if (options.mode === "mock") {
        return simulateProviderResponse(input, apiKey);
      }

      return sendViaResendApi(input, apiKey);
    },
  };
}

async function sendViaResendApi(
  input: ProviderSendInput,
  apiKey: string,
): Promise<ProviderSendResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: formatFromAddress(input.fromEmail, input.fromName),
        to: [formatRecipient(input.recipientEmail, input.recipientName)],
        subject: input.subject,
        html: input.html,
        ...(input.replyToEmail ? { reply_to: input.replyToEmail } : {}),
      }),
    });

    const responsePayloadJson = await parseResponseJson(response);

    if (response.ok) {
      const payload = responsePayloadJson as ResendSuccessResponse;

      return {
        ok: true,
        provider: input.provider,
        ...(typeof payload.id === "string"
          ? { providerMessageId: payload.id }
          : {}),
        responsePayloadJson,
      };
    }

    const error = extractProviderError(responsePayloadJson);

    return {
      ok: false,
      provider: input.provider,
      classification: classifyHttpFailure(response.status),
      errorCode: error.code ?? `RESEND_HTTP_${response.status}`,
      errorMessage: error.message ?? `Resend request failed with status ${response.status}.`,
      responsePayloadJson,
    };
  } catch (error) {
    const formatted = formatUnknownError(error);

    return {
      ok: false,
      provider: input.provider,
      classification: "retryable",
      errorCode: "RESEND_NETWORK_ERROR",
      errorMessage: formatted.message,
      responsePayloadJson: {
        error: {
          message: formatted.message,
          name: formatted.name,
        },
      },
    };
  }
}

function simulateProviderResponse(
  input: ProviderSendInput,
  apiKey: string,
): ProviderSendResult {
  const email = input.recipientEmail.toLowerCase();

  if (!apiKey) {
    return {
      ok: false,
      provider: input.provider,
      classification: "non_retryable",
      errorCode: "MISSING_PROVIDER_API_KEY",
      errorMessage: "Provider API key is missing.",
      responsePayloadJson: {},
    };
  }

  if (email.includes("nonretryable")) {
    return {
      ok: false,
      provider: input.provider,
      classification: "non_retryable",
      errorCode: "MOCK_NON_RETRYABLE",
      errorMessage: "Mock adapter simulated a permanent provider failure.",
      responsePayloadJson: {
        mode: "mock",
      },
    };
  }

  if (email.includes("retryable")) {
    return {
      ok: false,
      provider: input.provider,
      classification: "retryable",
      errorCode: "MOCK_RETRYABLE",
      errorMessage: "Mock adapter simulated a retryable provider failure.",
      responsePayloadJson: {
        mode: "mock",
      },
    };
  }

  if (email.includes("unknown")) {
    return {
      ok: false,
      provider: input.provider,
      classification: "unknown",
      errorCode: "MOCK_UNKNOWN",
      errorMessage: "Mock adapter simulated an unknown provider failure.",
      responsePayloadJson: {
        mode: "mock",
      },
    };
  }

  return {
    ok: true,
    provider: input.provider,
    providerMessageId: `mock_${crypto.randomUUID()}`,
    responsePayloadJson: {
      mode: "mock",
      accepted: true,
    },
  };
}

function classifyHttpFailure(status: number) {
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return "retryable" as const;
  }

  if (status >= 500) {
    return "retryable" as const;
  }

  if (status >= 400 && status < 500) {
    return "non_retryable" as const;
  }

  return "unknown" as const;
}

async function parseResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {
      raw: text,
    };
  }

  return {
    raw: text,
  };
}

function extractProviderError(payload: Record<string, unknown>) {
  const code =
    typeof payload.name === "string"
      ? payload.name
      : typeof payload.code === "string"
        ? payload.code
        : undefined;
  const message =
    typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : undefined;

  return { code, message };
}

function formatFromAddress(email: string, name: string) {
  return `${name} <${email}>`;
}

function formatRecipient(email: string, name: string) {
  return `${name} <${email}>`;
}

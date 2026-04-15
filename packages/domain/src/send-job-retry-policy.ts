import type { ProviderErrorClassification } from "./provider.js";

export const sendJobRetryBaseDelayMs = 5 * 60 * 1000;
export const sendJobRetryBackoffMultiplier = 2;
export const sendJobRetryMaxDelayMs = 60 * 60 * 1000;

export type SendJobRetryDecision =
  | {
      delayMs: number;
      nextScheduledAt: Date;
      outcome: "requeue";
      retryClass: "retryable" | "unknown";
    }
  | {
      outcome: "fail";
      retryClass: "retryable" | "unknown";
    };

type ComputeSendJobRetryDecisionInput = {
  attemptedAt?: Date;
  currentAttemptCount: number;
  classification: ProviderErrorClassification;
  maxAttempts: number;
};

export function computeSendJobRetryDecision(
  input: ComputeSendJobRetryDecisionInput,
): SendJobRetryDecision | null {
  if (input.classification === "non_retryable") {
    return null;
  }

  const nextAttemptCount = input.currentAttemptCount + 1;
  const retryClass =
    input.classification === "unknown" ? "unknown" : "retryable";

  if (nextAttemptCount >= input.maxAttempts) {
    return {
      outcome: "fail",
      retryClass,
    };
  }

  const attemptedAt = input.attemptedAt ?? new Date();
  const exponent = Math.max(0, nextAttemptCount - 1);
  const uncappedDelayMs =
    sendJobRetryBaseDelayMs * sendJobRetryBackoffMultiplier ** exponent;
  const delayMs = Math.min(uncappedDelayMs, sendJobRetryMaxDelayMs);

  return {
    outcome: "requeue",
    retryClass,
    delayMs,
    nextScheduledAt: new Date(attemptedAt.getTime() + delayMs),
  };
}

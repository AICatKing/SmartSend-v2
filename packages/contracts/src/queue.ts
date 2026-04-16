import { z } from "zod";

import { entityIdSchema } from "./primitives.js";

export const sendJobQueueMessageSchema = z.object({
  version: z.literal(1),
  kind: z.literal("send_job.process"),
  sendJobId: entityIdSchema,
});

export type SendJobQueueMessage = z.infer<typeof sendJobQueueMessageSchema>;

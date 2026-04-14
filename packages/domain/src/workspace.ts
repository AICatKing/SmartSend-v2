import { z } from "zod";

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);

export const workspaceContextSchema = z.object({
  userId: z.string().min(1),
  currentWorkspaceId: z.string().min(1),
  workspaceRole: workspaceRoleSchema,
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceContext = z.infer<typeof workspaceContextSchema>;

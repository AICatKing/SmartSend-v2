import { z } from "zod";
import { entityIdSchema, workspaceRoleSchema } from "./primitives.js";

const emailSchema = z.string().trim().email().max(320);
const nameSchema = z.string().trim().min(1).max(200);

export const authUserSchema = z.object({
  id: entityIdSchema,
  email: emailSchema,
  name: nameSchema.nullable(),
});

export const authWorkspaceMembershipSchema = z.object({
  workspaceId: entityIdSchema,
  workspaceName: z.string().min(1).max(200),
  role: workspaceRoleSchema,
});

export const authSessionContextSchema = z.object({
  sessionId: entityIdSchema,
  user: authUserSchema,
  currentWorkspaceId: entityIdSchema,
  currentWorkspaceRole: workspaceRoleSchema,
  workspaces: z.array(authWorkspaceMembershipSchema).min(1),
});

export const authLoginInputSchema = z.object({
  email: emailSchema,
  name: nameSchema.optional(),
  workspaceId: entityIdSchema.optional(),
});

export const authLoginOutputSchema = authSessionContextSchema;

export const authMeOutputSchema = authSessionContextSchema;

export const authListWorkspacesOutputSchema = z.object({
  currentWorkspaceId: entityIdSchema,
  workspaces: z.array(authWorkspaceMembershipSchema).min(1),
});

export const authSwitchWorkspaceInputSchema = z.object({
  workspaceId: entityIdSchema,
});

export const authSwitchWorkspaceOutputSchema = authSessionContextSchema;

export const authLogoutOutputSchema = z.object({
  success: z.literal(true),
});

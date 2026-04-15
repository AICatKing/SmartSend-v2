import {
  auditLogs,
  campaigns,
  contacts,
  deliveryAttempts,
  sendJobs,
  templates,
  users,
  workspaceMembers,
  workspaceSendingConfigs,
  workspaces,
  type Database,
} from "./index.js";

type UserInsert = typeof users.$inferInsert;
type WorkspaceInsert = typeof workspaces.$inferInsert;
type WorkspaceMemberInsert = typeof workspaceMembers.$inferInsert;
type TemplateInsert = typeof templates.$inferInsert;
type ContactInsert = typeof contacts.$inferInsert;
type CampaignInsert = typeof campaigns.$inferInsert;
type SendJobInsert = typeof sendJobs.$inferInsert;
type WorkspaceSendingConfigInsert = typeof workspaceSendingConfigs.$inferInsert;

export async function resetIntegrationTestDatabase(db: Database) {
  await db.delete(auditLogs);
  await db.delete(deliveryAttempts);
  await db.delete(workspaceSendingConfigs);
  await db.delete(sendJobs);
  await db.delete(campaigns);
  await db.delete(contacts);
  await db.delete(templates);
  await db.delete(workspaceMembers);
  await db.delete(workspaces);
  await db.delete(users);
}

type SeedWorkspaceMembershipFixtureInput = {
  memberships?: WorkspaceMemberInsert[];
  users?: UserInsert[];
  workspaces?: WorkspaceInsert[];
};

export async function seedWorkspaceMembershipFixture(
  db: Database,
  input: SeedWorkspaceMembershipFixtureInput,
) {
  if (input.users?.length) {
    await db.insert(users).values(input.users);
  }

  if (input.workspaces?.length) {
    await db.insert(workspaces).values(input.workspaces);
  }

  if (input.memberships?.length) {
    await db.insert(workspaceMembers).values(input.memberships);
  }
}

export async function insertTemplateFixture(db: Database, input: TemplateInsert) {
  await db.insert(templates).values(input);
}

export async function insertContactFixture(db: Database, input: ContactInsert) {
  await db.insert(contacts).values(input);
}

export async function insertCampaignFixture(db: Database, input: CampaignInsert) {
  await db.insert(campaigns).values(input);
}

export async function insertSendJobFixture(db: Database, input: SendJobInsert) {
  await db.insert(sendJobs).values(input);
}

export async function insertWorkspaceSendingConfigFixture(
  db: Database,
  input: WorkspaceSendingConfigInsert,
) {
  await db.insert(workspaceSendingConfigs).values(input);
}

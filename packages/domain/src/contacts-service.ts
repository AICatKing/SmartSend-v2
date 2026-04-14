import { and, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { AppError } from "@smartsend/shared";
import {
  contactCreateInputSchema,
  contactCreateOutputSchema,
  contactImportInputSchema,
  contactImportOutputSchema,
  contactListInputSchema,
  contactListOutputSchema,
  contactRemoveInputSchema,
  contactRemoveOutputSchema,
  contactSchema,
  contactUpdateInputSchema,
  contactUpdateOutputSchema,
} from "@smartsend/contracts";
import type { Database } from "@smartsend/db";
import { contacts } from "@smartsend/db";

import { entityIdSchema } from "./contact.js";

const createContactId = () => `contact_${crypto.randomUUID()}`;

export async function listContacts(db: Database, input: unknown) {
  const parsed = contactListInputSchema.parse(input);

  const filters = [
    eq(contacts.workspaceId, parsed.workspaceId),
    parsed.includeDeleted ? undefined : isNull(contacts.deletedAt),
    parsed.groupName ? eq(contacts.groupName, parsed.groupName) : undefined,
    parsed.query
      ? or(
          ilike(contacts.email, `%${parsed.query}%`),
          ilike(contacts.name, `%${parsed.query}%`),
          ilike(contacts.company, `%${parsed.query}%`),
        )
      : undefined,
  ].filter(Boolean);

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(whereClause)
      .orderBy(sql`${contacts.createdAt} desc`)
      .limit(parsed.limit)
      .offset(parsed.offset),
    db.select({ total: count() }).from(contacts).where(whereClause),
  ]);

  return contactListOutputSchema.parse({
    items: items.map(toContactDto),
    total: totalRows[0]?.total ?? 0,
  });
}

export async function createContact(db: Database, input: unknown) {
  const parsed = contactCreateInputSchema.parse(input);

  try {
    const [created] = await db
      .insert(contacts)
      .values({
        id: createContactId(),
        workspaceId: parsed.workspaceId,
        email: parsed.contact.email,
        name: parsed.contact.name,
        company: parsed.contact.company ?? null,
        groupName: parsed.contact.groupName ?? null,
        customFields: parsed.contact.customFields,
      })
      .returning();

    return contactCreateOutputSchema.parse({
      contact: toContactDto(assertFound(created)),
    });
  } catch (error) {
    throw mapContactWriteError(error);
  }
}

export async function updateContact(db: Database, input: unknown) {
  const parsed = contactUpdateInputSchema.parse(input);

  const patch = {
    ...(parsed.patch.email !== undefined ? { email: parsed.patch.email } : {}),
    ...(parsed.patch.name !== undefined ? { name: parsed.patch.name } : {}),
    ...(parsed.patch.company !== undefined ? { company: parsed.patch.company } : {}),
    ...(parsed.patch.groupName !== undefined
      ? { groupName: parsed.patch.groupName }
      : {}),
    ...(parsed.patch.customFields !== undefined
      ? { customFields: parsed.patch.customFields }
      : {}),
    updatedAt: new Date(),
  };

  try {
    const [updated] = await db
      .update(contacts)
      .set(patch)
      .where(
        and(
          eq(contacts.id, parsed.contactId),
          eq(contacts.workspaceId, parsed.workspaceId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new AppError("NOT_FOUND", "Contact not found.", {
        details: {
          workspaceId: parsed.workspaceId,
          contactId: parsed.contactId,
        },
      });
    }

    return contactUpdateOutputSchema.parse({
      contact: toContactDto(updated),
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw mapContactWriteError(error);
  }
}

export async function removeContact(db: Database, input: unknown) {
  const parsed = contactRemoveInputSchema.parse(input);

  const [removed] = await db
    .update(contacts)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contacts.id, parsed.contactId),
        eq(contacts.workspaceId, parsed.workspaceId),
        isNull(contacts.deletedAt),
      ),
    )
    .returning({ id: contacts.id });

  if (!removed) {
    throw new AppError("NOT_FOUND", "Contact not found.", {
      details: {
        workspaceId: parsed.workspaceId,
        contactId: parsed.contactId,
      },
    });
  }

  return contactRemoveOutputSchema.parse({
    success: true,
    contactId: removed.id,
  });
}

export async function importContacts(db: Database, input: unknown) {
  const parsed = contactImportInputSchema.parse(input);

  try {
    const created = await db
      .insert(contacts)
      .values(
        parsed.contacts.map((contact) => ({
          id: createContactId(),
          workspaceId: parsed.workspaceId,
          email: contact.email,
          name: contact.name,
          company: contact.company ?? null,
          groupName: contact.groupName ?? null,
          customFields: contact.customFields,
        })),
      )
      .returning();

    return contactImportOutputSchema.parse({
      contacts: created.map(toContactDto),
      importedCount: created.length,
    });
  } catch (error) {
    throw mapContactWriteError(error);
  }
}

function toContactDto(record: typeof contacts.$inferSelect) {
  return contactSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    email: record.email,
    name: record.name,
    company: record.company,
    groupName: record.groupName,
    customFields: record.customFields,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  });
}

function mapContactWriteError(error: unknown) {
  if (isUniqueViolation(error)) {
    return new AppError("VALIDATION_ERROR", "A contact with this email already exists in the workspace.", {
      cause: error,
      details: {
        constraint: "contacts_workspace_email_active_unique",
      },
    });
  }

  return new AppError("DEPENDENCY_ERROR", "Failed to persist contact.", {
    cause: error,
  });
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function assertFound<T>(value: T | undefined): T {
  if (!value) {
    throw new AppError("DEPENDENCY_ERROR", "Database did not return the expected record.");
  }

  return value;
}

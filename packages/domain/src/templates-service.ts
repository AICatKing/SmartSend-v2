import { AppError } from "@smartsend/shared";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  templateCreateInputSchema,
  templateCreateOutputSchema,
  templateListInputSchema,
  templateListOutputSchema,
  templatePreviewRenderInputSchema,
  templatePreviewRenderOutputSchema,
  templateRemoveInputSchema,
  templateRemoveOutputSchema,
  templateSchema,
  templateUpdateInputSchema,
  templateUpdateOutputSchema,
} from "@smartsend/contracts";
import type { Database } from "@smartsend/db";
import { templates } from "@smartsend/db";
import { renderTemplateWithVariables } from "./template-render.js";

const createTemplateId = () => `template_${crypto.randomUUID()}`;

export async function listTemplates(db: Database, input: unknown) {
  const parsed = templateListInputSchema.parse(input);

  const filters = [
    eq(templates.workspaceId, parsed.workspaceId),
    parsed.includeDeleted ? undefined : isNull(templates.deletedAt),
  ].filter(Boolean);

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(templates)
      .where(whereClause)
      .orderBy(sql`${templates.createdAt} desc`)
      .limit(parsed.limit)
      .offset(parsed.offset),
    db.select({ total: count() }).from(templates).where(whereClause),
  ]);

  return templateListOutputSchema.parse({
    items: items.map(toTemplateDto),
    total: totalRows[0]?.total ?? 0,
  });
}

export async function createTemplate(db: Database, input: unknown) {
  const parsed = templateCreateInputSchema.parse(input);

  const [created] = await db
    .insert(templates)
    .values({
      id: createTemplateId(),
      workspaceId: parsed.workspaceId,
      name: parsed.template.name,
      subject: parsed.template.subject,
      bodyHtml: parsed.template.bodyHtml,
    })
    .returning();

  return templateCreateOutputSchema.parse({
    template: toTemplateDto(assertFound(created)),
  });
}

export async function updateTemplate(db: Database, input: unknown) {
  const parsed = templateUpdateInputSchema.parse(input);

  const [updated] = await db
    .update(templates)
    .set({
      ...(parsed.patch.name !== undefined ? { name: parsed.patch.name } : {}),
      ...(parsed.patch.subject !== undefined
        ? { subject: parsed.patch.subject }
        : {}),
      ...(parsed.patch.bodyHtml !== undefined
        ? { bodyHtml: parsed.patch.bodyHtml }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(templates.id, parsed.templateId),
        eq(templates.workspaceId, parsed.workspaceId),
        isNull(templates.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError("NOT_FOUND", "Template not found.", {
      details: {
        workspaceId: parsed.workspaceId,
        templateId: parsed.templateId,
      },
    });
  }

  return templateUpdateOutputSchema.parse({
    template: toTemplateDto(updated),
  });
}

export async function removeTemplate(db: Database, input: unknown) {
  const parsed = templateRemoveInputSchema.parse(input);

  const [removed] = await db
    .update(templates)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(templates.id, parsed.templateId),
        eq(templates.workspaceId, parsed.workspaceId),
        isNull(templates.deletedAt),
      ),
    )
    .returning({ id: templates.id });

  if (!removed) {
    throw new AppError("NOT_FOUND", "Template not found.", {
      details: {
        workspaceId: parsed.workspaceId,
        templateId: parsed.templateId,
      },
    });
  }

  return templateRemoveOutputSchema.parse({
    success: true,
    templateId: removed.id,
  });
}

export function previewRenderTemplate(input: unknown) {
  const parsed = templatePreviewRenderInputSchema.parse(input);
  const subjectResult = renderTemplateWithVariables(
    parsed.template.subject,
    parsed.variables,
    "keep",
  );
  const bodyResult = renderTemplateWithVariables(
    parsed.template.bodyHtml,
    parsed.variables,
    "keep",
  );
  const missingVariables = [
    ...new Set([...subjectResult.missingVariables, ...bodyResult.missingVariables]),
  ];

  return templatePreviewRenderOutputSchema.parse({
    renderedSubject: subjectResult.rendered,
    renderedBodyHtml: bodyResult.rendered,
    missingVariables,
  });
}

function toTemplateDto(record: typeof templates.$inferSelect) {
  return templateSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    subject: record.subject,
    bodyHtml: record.bodyHtml,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  });
}

function assertFound<T>(value: T | undefined): T {
  if (!value) {
    throw new AppError("DEPENDENCY_ERROR", "Database did not return the expected record.");
  }

  return value;
}

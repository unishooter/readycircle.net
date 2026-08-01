import { and, asc, eq } from 'drizzle-orm';
import { circles, planDocuments, planSections, planVersions, plans, type Database } from '@readycircle/database';
import type { PlanDocumentFormat } from '@readycircle/contracts';
import type { DocumentStore } from './document-store.js';
import { renderPlanPdf } from './pdf.js';
import type { EngineLogger } from './types.js';

export interface GeneratePlanDocumentOptions {
  db: Database;
  planVersionId: string;
  format: PlanDocumentFormat;
  store: DocumentStore;
  logger: EngineLogger;
}

export type GeneratePlanDocumentResult =
  | { status: 'ready'; storageKey: string }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

/**
 * Renders a published plan version to a document and stores it. Tracks
 * progress in `plan_documents` (one row per version+format, upserted) so
 * the API can report pending/ready/failed to the frontend. Failures are
 * recorded rather than thrown, mirroring `generatePlanVersion`.
 */
export async function generatePlanDocument(options: GeneratePlanDocumentOptions): Promise<GeneratePlanDocumentResult> {
  const { db, planVersionId, format, store, logger } = options;

  const [version] = await db.select().from(planVersions).where(eq(planVersions.id, planVersionId)).limit(1);
  if (!version) {
    logger.warn({ planVersionId }, 'plan version not found; skipping document generation');
    return { status: 'skipped', reason: 'version not found' };
  }
  if (version.status !== 'published') {
    logger.warn({ planVersionId, status: version.status }, 'plan version is not published; skipping document generation');
    return { status: 'skipped', reason: `version status is ${version.status}` };
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, version.planId)).limit(1);
  if (!plan) {
    logger.warn({ planVersionId, planId: version.planId }, 'parent plan not found; skipping document generation');
    return { status: 'skipped', reason: 'plan not found' };
  }

  const storageKey = `plans/${plan.id}/version-${version.versionNumber}.${format}`;

  await db
    .insert(planDocuments)
    .values({ planVersionId, format, storageKey, status: 'pending', errorMessage: null })
    .onConflictDoUpdate({
      target: [planDocuments.planVersionId, planDocuments.format],
      set: { status: 'pending', storageKey, errorMessage: null, completedAt: null },
    });

  try {
    if (format !== 'pdf') {
      throw new Error(`Document format "${format}" is not supported yet.`);
    }

    const [circle] = await db.select().from(circles).where(eq(circles.id, plan.circleId)).limit(1);
    const sections = await db
      .select()
      .from(planSections)
      .where(eq(planSections.planVersionId, planVersionId))
      .orderBy(asc(planSections.sortOrder));

    const body = await renderPlanPdf({
      planTitle: plan.title,
      circleName: circle?.name ?? 'Radio Circle',
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      sections: sections.map((section) => ({
        sectionKey: section.sectionKey,
        title: section.title,
        content: section.content,
      })),
    });

    await store.put(storageKey, body, 'application/pdf');

    await db
      .update(planDocuments)
      .set({ status: 'ready', completedAt: new Date(), errorMessage: null })
      .where(and(eq(planDocuments.planVersionId, planVersionId), eq(planDocuments.format, format)));

    logger.info({ planVersionId, storageKey, bytes: body.byteLength }, 'plan document rendered and stored');
    return { status: 'ready', storageKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ planVersionId, err: error }, 'plan document generation failed');
    await db
      .update(planDocuments)
      .set({ status: 'failed', errorMessage: message.slice(0, 1000) })
      .where(and(eq(planDocuments.planVersionId, planVersionId), eq(planDocuments.format, format)));
    return { status: 'failed', error: message };
  }
}

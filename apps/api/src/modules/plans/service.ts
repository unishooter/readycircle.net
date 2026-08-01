import type { Database } from '@readycircle/database';
import type {
  CreatePlanInput,
  PlanDetailResponse,
  PlanDocumentFormat,
  PlanDocumentStatus,
  PlanResponse,
  PlanVersionDetail,
  PlanVersionStatus,
  PlanVersionSummary,
} from '@readycircle/contracts';
import type { DocumentStore } from '@readycircle/plan-engine';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCircleById, getViewerRole } from '../circles/repository.js';
import type { JobDispatcher } from './dispatcher.js';
import {
  addPlanVersion,
  createPlanWithFirstVersion,
  getDocumentForVersion,
  getDocumentsForVersions,
  getPlanById,
  getSectionsForVersion,
  getVersionById,
  listPlansForCircle,
  listPlansForUser,
  listVersionsForPlan,
  publishVersion,
  type PlanDocumentRow,
  type PlanRow,
  type PlanVersionRow,
} from './repository.js';

export interface PlanDocumentDownload {
  body: Uint8Array;
  contentType: string;
  filename: string;
}

export class PlanService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly dispatcher: JobDispatcher,
    private readonly documentStore: DocumentStore,
  ) {}

  async createPlan(
    circleId: string,
    userId: string,
    input: CreatePlanInput,
    requestId: string,
  ): Promise<PlanResponse> {
    const { circle, role } = await this.requireCircleAccess(circleId, userId);
    if (role !== 'coordinator') {
      throw new ForbiddenError('Only Circle coordinators may generate plans.');
    }

    const title = input.title ?? `${circle.name} communications plan`;
    const { planId, versionId } = await createPlanWithFirstVersion(this.db, {
      circleId,
      title,
      createdBy: userId,
    });

    await this.audit.record({
      actorUserId: userId,
      action: 'plan.generation_requested',
      targetType: 'plan',
      targetId: planId,
      requestId,
      metadata: { circleId, versionNumber: 1 },
    });
    await this.dispatcher.dispatchPlanGeneration({ planVersionId: versionId, requestedByUserId: userId });

    return this.shapePlan((await getPlanById(this.db, planId))!, circle.name, role);
  }

  async regenerate(planId: string, userId: string, requestId: string): Promise<PlanResponse> {
    const plan = await this.requirePlan(planId);
    const { circle, role } = await this.requireCircleAccess(plan.circleId, userId);
    if (role !== 'coordinator') {
      throw new ForbiddenError('Only Circle coordinators may regenerate plans.');
    }

    const versions = await listVersionsForPlan(this.db, planId);
    if (versions.some((version) => version.status === 'generating')) {
      throw new ConflictError('A version of this plan is already being generated.');
    }

    const { versionId, versionNumber } = await addPlanVersion(this.db, planId, userId);
    await this.audit.record({
      actorUserId: userId,
      action: 'plan.generation_requested',
      targetType: 'plan',
      targetId: planId,
      requestId,
      metadata: { circleId: plan.circleId, versionNumber },
    });
    await this.dispatcher.dispatchPlanGeneration({ planVersionId: versionId, requestedByUserId: userId });

    return this.shapePlan((await getPlanById(this.db, planId))!, circle.name, role);
  }

  async listForUser(userId: string): Promise<PlanResponse[]> {
    const rows = await listPlansForUser(this.db, userId);
    return Promise.all(
      rows.map(async ({ plan, circleName }) => {
        const role = await getViewerRole(this.db, plan.circleId, userId);
        return this.shapePlan(plan, circleName, role);
      }),
    );
  }

  async listForCircle(circleId: string, userId: string): Promise<PlanResponse[]> {
    const { circle, role } = await this.requireCircleAccess(circleId, userId);
    const rows = await listPlansForCircle(this.db, circleId);
    return Promise.all(rows.map((plan) => this.shapePlan(plan, circle.name, role)));
  }

  async getPlan(planId: string, userId: string): Promise<PlanDetailResponse> {
    const plan = await this.requirePlan(planId);
    const { circle, role } = await this.requireCircleAccess(plan.circleId, userId);

    const versions = await listVersionsForPlan(this.db, planId);
    const documents = await getDocumentsForVersions(
      this.db,
      versions.map((version) => version.id),
    );
    const base = await this.shapePlan(plan, circle.name, role, versions, documents);
    return {
      ...base,
      versions: versions.map((version) => this.shapeVersion(version, documents.get(version.id) ?? null)),
    };
  }

  async getVersion(planId: string, versionId: string, userId: string): Promise<PlanVersionDetail> {
    const plan = await this.requirePlan(planId);
    await this.requireCircleAccess(plan.circleId, userId);

    const version = await this.requireVersion(versionId, planId);
    const document = await getDocumentForVersion(this.db, versionId, 'pdf');
    const sections = await getSectionsForVersion(this.db, versionId);

    return {
      ...this.shapeVersion(version, document),
      sections: sections.map((section) => ({
        sectionKey: section.sectionKey,
        title: section.title,
        content: section.content,
        sortOrder: section.sortOrder,
      })),
    };
  }

  async publish(planId: string, versionId: string, userId: string, requestId: string): Promise<PlanVersionSummary> {
    const plan = await this.requirePlan(planId);
    const { role } = await this.requireCircleAccess(plan.circleId, userId);
    if (role !== 'coordinator') {
      throw new ForbiddenError('Only Circle coordinators may publish plans.');
    }

    const version = await this.requireVersion(versionId, planId);
    if (version.status === 'published') {
      throw new ConflictError('This version is already published.');
    }
    if (version.status !== 'draft') {
      throw new ConflictError(`Only draft versions can be published (this version is ${version.status}).`);
    }

    const published = await publishVersion(this.db, versionId);
    if (!published) throw new NotFoundError('Plan version not found.');

    await this.audit.record({
      actorUserId: userId,
      action: 'plan.published',
      targetType: 'plan',
      targetId: planId,
      requestId,
      metadata: { versionId, versionNumber: version.versionNumber },
    });
    await this.dispatcher.dispatchDocumentGeneration({ planVersionId: versionId, format: 'pdf' });

    return this.shapeVersion(published, null);
  }

  async getDocumentDownload(planId: string, versionId: string, userId: string): Promise<PlanDocumentDownload> {
    const plan = await this.requirePlan(planId);
    await this.requireCircleAccess(plan.circleId, userId);
    const version = await this.requireVersion(versionId, planId);

    const document = await getDocumentForVersion(this.db, versionId, 'pdf');
    if (!document || document.status !== 'ready') {
      throw new NotFoundError('The document for this plan version is not ready yet.');
    }

    const stored = await this.documentStore.get(document.storageKey);
    if (!stored) {
      throw new NotFoundError('The stored document could not be found.');
    }

    const safeTitle = plan.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'communications-plan';
    return {
      body: stored.body,
      contentType: document.contentType,
      filename: `${safeTitle} v${version.versionNumber}.pdf`,
    };
  }

  private async requirePlan(planId: string): Promise<PlanRow> {
    const plan = await getPlanById(this.db, planId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  private async requireVersion(versionId: string, planId: string): Promise<PlanVersionRow> {
    const version = await getVersionById(this.db, versionId);
    if (!version || version.planId !== planId) throw new NotFoundError('Plan version not found.');
    return version;
  }

  private async requireCircleAccess(circleId: string, userId: string) {
    const circle = await getCircleById(this.db, circleId);
    if (!circle) throw new NotFoundError('Circle not found.');
    const role = await getViewerRole(this.db, circleId, userId);
    if (!role) throw new ForbiddenError('You do not have access to this Circle.');
    return { circle, role };
  }

  private async shapePlan(
    plan: PlanRow,
    circleName: string,
    role: 'coordinator' | 'member' | null,
    knownVersions?: PlanVersionRow[],
    knownDocuments?: Map<string, PlanDocumentRow>,
  ): Promise<PlanResponse> {
    const versions = knownVersions ?? (await listVersionsForPlan(this.db, plan.id));
    const latest = versions[0] ?? null;
    let latestDocument: PlanDocumentRow | null = null;
    if (latest) {
      latestDocument = knownDocuments
        ? (knownDocuments.get(latest.id) ?? null)
        : await getDocumentForVersion(this.db, latest.id, 'pdf');
    }

    return {
      id: plan.id,
      circleId: plan.circleId,
      circleName,
      title: plan.title,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      latestVersion: latest ? this.shapeVersion(latest, latestDocument) : null,
      viewerCanManage: role === 'coordinator',
    };
  }

  private shapeVersion(version: PlanVersionRow, document: PlanDocumentRow | null): PlanVersionSummary {
    return {
      id: version.id,
      planId: version.planId,
      versionNumber: version.versionNumber,
      status: version.status as PlanVersionStatus,
      errorMessage: version.errorMessage,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      document: document
        ? {
            format: document.format as PlanDocumentFormat,
            status: document.status as PlanDocumentStatus,
            errorMessage: document.errorMessage,
            completedAt: document.completedAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}

import { recordAudit } from "@/platform/audit";
import { ForbiddenError, NotFoundError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { LEAD_PERMISSIONS } from "../permissions";
import { savedViewSchema } from "../schemas";

/** Allowed URL parameters of a saved lead view (anything else is dropped). */
const VIEW_PARAMS = new Set([
  "view",
  "q",
  "sort",
  "pageSize",
  "status",
  "category",
  "source",
  "campaign",
  "owner",
  "team",
  "builder",
  "project",
  "temperature",
  "tag",
  "createdFrom",
  "createdTo",
  "activityFrom",
  "activityTo",
  "hide",
]);

export function sanitizeViewQuery(query: string): string {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const clean = new URLSearchParams();
  for (const [key, value] of params)
    if (VIEW_PARAMS.has(key) && value.length <= 500) clean.append(key, value);
  return clean.toString();
}

export interface SavedViewRow {
  id: string;
  name: string;
  query: string;
  isShared: boolean;
  isMine: boolean;
  ownerName: string;
}

/** The actor's views plus views shared by others (M04-14). */
export async function listSavedViews(ctx: ServiceContext): Promise<SavedViewRow[]> {
  ctx.permissions.assert(LEAD_PERMISSIONS.view);
  const membershipId = ctx.actor.membershipId;
  const views = await ctx.db.savedView.findMany({
    where: { OR: [{ isShared: true }, ...(membershipId ? [{ ownerId: membershipId }] : [])] },
    orderBy: [{ isShared: "asc" }, { name: "asc" }],
    include: { owner: { select: { user: { select: { name: true } } } } },
  });
  return views.map((view) => ({
    id: view.id,
    name: view.name,
    query: view.query,
    isShared: view.isShared,
    isMine: view.ownerId === membershipId,
    ownerName: view.owner.user.name,
  }));
}

export async function saveView(
  ctx: ServiceContext,
  viewId: string | null,
  input: { name: string; query: string; isShared?: boolean },
) {
  ctx.permissions.assert(LEAD_PERMISSIONS.view);
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) throw new ForbiddenError("Only people can save views.");
  const values = parseInput(savedViewSchema, input);
  const query = sanitizeViewQuery(values.query);
  if (viewId) {
    const view = await ctx.db.savedView.findFirst({ where: { id: viewId } });
    if (!view) throw new NotFoundError("View", viewId);
    if (view.ownerId !== membershipId)
      throw new ForbiddenError("Only the owner can change this view.");
    await ctx.db.savedView.update({
      where: { id: viewId },
      data: { name: values.name, query, isShared: values.isShared },
    });
    return { id: viewId };
  }
  const view = await ctx.db.savedView.create({
    data: {
      organizationId: ctx.organizationId,
      ownerId: membershipId,
      name: values.name,
      query,
      isShared: values.isShared,
    },
  });
  if (values.isShared) {
    await recordAudit(ctx.db, ctx, {
      action: "lead_view.share",
      entityType: "SavedView",
      entityId: view.id,
      summary: `Shared the lead view "${view.name}"`,
    });
  }
  return { id: view.id };
}

export async function deleteView(ctx: ServiceContext, viewId: string) {
  const view = await ctx.db.savedView.findFirst({ where: { id: viewId } });
  if (!view) throw new NotFoundError("View", viewId);
  const isOwner = view.ownerId === ctx.actor.membershipId;
  if (!isOwner && !ctx.permissions.has(LEAD_PERMISSIONS.mastersManage)) {
    throw new ForbiddenError("Only the owner can delete this view.");
  }
  await ctx.db.savedView.delete({ where: { id: viewId } });
}

import { recordAudit } from "@/platform/audit";
import { ForbiddenError, NotFoundError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { LEAD_ACTIVITY_TYPES } from "../constants";
import { LEAD_PERMISSIONS } from "../permissions";
import { noteSchema } from "../schemas";
import { findVisibleLead } from "./scope";
import { recordLeadActivity } from "./timeline";

export interface LeadNoteRow {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  isPinned: boolean;
  editedAt: string | null;
  createdAt: string;
}

/** Notes of a lead (M04-09): pinned first, then newest. Deleted notes stay in the database and the timeline. */
export async function listLeadNotes(ctx: ServiceContext, leadId: string): Promise<LeadNoteRow[]> {
  await findVisibleLead(ctx, leadId);
  const notes = await ctx.db.leadNote.findMany({
    where: { leadId, deletedAt: null },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
  return notes.map((note) => ({
    id: note.id,
    body: note.body,
    authorId: note.authorId,
    authorName: note.authorName,
    isPinned: note.isPinned,
    editedAt: note.editedAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
  }));
}

export async function addLeadNote(ctx: ServiceContext, leadId: string, input: { body: string }) {
  const { body } = parseInput(noteSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, leadId, {
      permission: LEAD_PERMISSIONS.update,
      db: tx,
    });
    const note = await tx.leadNote.create({
      data: {
        organizationId: ctx.organizationId,
        leadId,
        authorId: ctx.actor.membershipId ?? null,
        authorName: ctx.actor.name,
        body,
      },
    });
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: LEAD_ACTIVITY_TYPES.NOTE_ADDED,
      summary: "Added a note",
      payload: { noteId: note.id, excerpt: body.slice(0, 200) },
    });
    await recordAudit(tx, ctx, {
      action: "lead.note.add",
      entityType: "Lead",
      entityId: leadId,
      summary: `Added a note to ${lead.number}`,
      metadata: { noteId: note.id },
    });
    await publishEvent(tx, ctx, "lead.note_added", { leadId, noteId: note.id });
    return { id: note.id };
  });
}

async function findNote(ctx: ServiceContext, noteId: string) {
  const note = await ctx.db.leadNote.findFirst({ where: { id: noteId, deletedAt: null } });
  if (!note) throw new NotFoundError("Note", noteId);
  return note;
}

/** Authors edit their own notes; the previous text stays in the timeline (M04-09). */
export async function updateLeadNote(ctx: ServiceContext, noteId: string, input: { body: string }) {
  const { body } = parseInput(noteSchema, input);
  const note = await findNote(ctx, noteId);
  if (!ctx.actor.membershipId || note.authorId !== ctx.actor.membershipId) {
    throw new ForbiddenError("You can only edit your own notes.");
  }
  await ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, note.leadId, {
      permission: LEAD_PERMISSIONS.update,
      db: tx,
    });
    if (note.body === body) return;
    await tx.leadNote.update({ where: { id: noteId }, data: { body, editedAt: new Date() } });
    await recordLeadActivity(tx, ctx, {
      leadId: note.leadId,
      type: LEAD_ACTIVITY_TYPES.NOTE_UPDATED,
      summary: "Edited a note",
      payload: { noteId, previous: note.body.slice(0, 500), excerpt: body.slice(0, 200) },
      touch: false,
    });
    await recordAudit(tx, ctx, {
      action: "lead.note.update",
      entityType: "Lead",
      entityId: note.leadId,
      summary: `Edited a note on ${lead.number}`,
      changes: { note: { from: note.body, to: body } },
      metadata: { noteId },
    });
  });
}

export async function setLeadNotePinned(ctx: ServiceContext, noteId: string, pinned: boolean) {
  const note = await findNote(ctx, noteId);
  await ctx.db.$transaction(async (tx) => {
    await findVisibleLead(ctx, note.leadId, { permission: LEAD_PERMISSIONS.update, db: tx });
    await tx.leadNote.update({ where: { id: noteId }, data: { isPinned: pinned } });
  });
}

/** Soft delete by the author or by someone who can delete leads; kept for accountability. */
export async function deleteLeadNote(ctx: ServiceContext, noteId: string) {
  const note = await findNote(ctx, noteId);
  const isAuthor = Boolean(ctx.actor.membershipId && note.authorId === ctx.actor.membershipId);
  if (!isAuthor && !ctx.permissions.has(LEAD_PERMISSIONS.delete)) {
    throw new ForbiddenError("You can only delete your own notes.");
  }
  await ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, note.leadId, {
      permission: LEAD_PERMISSIONS.update,
      db: tx,
    });
    await tx.leadNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    await recordLeadActivity(tx, ctx, {
      leadId: note.leadId,
      type: LEAD_ACTIVITY_TYPES.NOTE_DELETED,
      summary: "Deleted a note",
      payload: { noteId, excerpt: note.body.slice(0, 200) },
      touch: false,
    });
    await recordAudit(tx, ctx, {
      action: "lead.note.delete",
      entityType: "Lead",
      entityId: note.leadId,
      summary: `Deleted a note on ${lead.number}`,
      metadata: { noteId, body: note.body },
    });
  });
}

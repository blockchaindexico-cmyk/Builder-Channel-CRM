"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { findMembers } from "@/modules/identity";
import { findVisibleLead, listLeadStatuses } from "@/modules/leads";
import { tenantAction } from "@/platform/actions/client";
import { resolveDataScope } from "@/platform/rbac/scope";

import { DEAL_PERMISSIONS } from "./permissions";
import {
  bookingStageSchema,
  cancelBookingSchema,
  type cancelVisitSchema,
  closeBookingSchema,
  type completeVisitSchema,
  type createBookingSchema,
  dealSettingsSchema,
  lossReasonSchema,
  markLostSchema,
  moveBookingStageSchema,
  type noShowVisitSchema,
  requestBookingDocumentSchema,
  type rescheduleVisitSchema,
  type scheduleVisitSchema,
  type updateBookingSchema,
  visitOutcomeSchema,
} from "./schemas";
import * as bookings from "./server/bookings";
import * as closure from "./server/closure";
import * as files from "./server/files";
import * as masters from "./server/masters";
import * as settings from "./server/settings";
import * as visits from "./server/visits";

const values = z.record(z.string(), z.unknown());

const refreshDeals = (leadId?: string, bookingId?: string) => {
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (bookingId) revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/leads", "layout");
  revalidatePath("/visits");
  revalidatePath("/bookings");
  revalidatePath("/agenda");
};

// --- Dialog options -----------------------------------------------------------------------------------------------

/** What the visit dialogs need: the lead, projects (its interests first), outcomes and who may conduct a visit. */
export const visitDialogOptionsAction = tenantAction
  .metadata({ name: "deals.visit.options", permission: DEAL_PERMISSIONS.visitsView })
  .inputSchema(z.object({ leadId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const lead = await findVisibleLead(ctx.service, parsedInput.leadId, {
      include: {
        status: { select: { label: true, isTerminal: true } },
        interests: { select: { projectId: true } },
      },
    });
    const interestIds = new Set(lead.interests.map((interest) => interest.projectId));
    const [projects, outcomes, completed, counts, scope] = await Promise.all([
      ctx.service.db.project.findMany({
        where: { OR: [{ isActive: true }, { id: { in: [...interestIds] } }] },
        orderBy: [{ builder: { name: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          builder: { select: { name: true } },
        },
      }),
      masters.listVisitOutcomes(ctx.service, { activeOnly: true }),
      ctx.service.db.siteVisit.count({ where: { leadId: lead.id, status: "COMPLETED" } }),
      ctx.service.db.siteVisit.groupBy({
        by: ["isRevisit"],
        where: { leadId: lead.id, status: { not: "RESCHEDULED" } },
        _count: { _all: true },
      }),
      resolveDataScope(ctx.service, DEAL_PERMISSIONS.visitsManage).catch(() => null),
    ]);
    const members = await findMembers(ctx.service.db, {
      activeOnly: true,
      withPermission: DEAL_PERMISSIONS.visitsManage,
      ...(scope && scope.scope !== "ALL" ? { ids: scope.membershipIds } : {}),
    });
    const revisit = completed > 0;
    const count = counts.find((group) => group.isRevisit === revisit)?._count._all ?? 0;
    return {
      lead: {
        id: lead.id,
        number: lead.number,
        name: lead.name,
        ownerId: lead.ownerId,
        statusLabel: lead.status.label,
        isClosed: lead.status.isTerminal,
      },
      nextLabel: `${revisit ? "Revisit" : "Visit"} ${count + 1}`,
      projects: projects
        .filter((project) => project.isActive || interestIds.has(project.id))
        .map((project) => ({
          id: project.id,
          name: project.name,
          code: project.code,
          builderName: project.builder.name,
          interested: interestIds.has(project.id),
        })),
      outcomes: outcomes.map(({ usage: _usage, ...outcome }) => outcome),
      members: members.map((member) => ({ id: member.membershipId, name: member.name })),
    };
  });

/** Active loss reasons for a status or a cancellation. */
export const lossReasonOptionsAction = tenantAction
  .metadata({ name: "deals.loss-reasons" })
  .inputSchema(z.object({ scope: z.enum(["LOST", "NOT_INTERESTED", "BOOKING_CANCELLED"]) }))
  .action(async ({ parsedInput, ctx }) =>
    (await masters.listLossReasons(ctx.service, { scope: parsedInput.scope })).map((reason) => ({
      id: reason.id,
      label: reason.label,
    })),
  );

// --- Visits (M08-03 → M08-05) ----------------------------------------------------------------------------------------

export const scheduleVisitAction = tenantAction
  .metadata({ name: "deals.visit.schedule", permission: DEAL_PERMISSIONS.visitsManage })
  .inputSchema(z.object({ values }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await visits.scheduleVisit(
      ctx.service,
      parsedInput.values as z.input<typeof scheduleVisitSchema>,
    );
    refreshDeals(parsedInput.values.leadId as string);
    return result;
  });

const visitChange = z.object({ leadId: z.uuid(), values });

export const confirmVisitAction = tenantAction
  .metadata({ name: "deals.visit.confirm", permission: DEAL_PERMISSIONS.visitsManage })
  .inputSchema(z.object({ leadId: z.uuid(), visitId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await visits.confirmVisit(ctx.service, { visitId: parsedInput.visitId });
    refreshDeals(parsedInput.leadId);
  });

export const completeVisitAction = tenantAction
  .metadata({ name: "deals.visit.complete", permission: DEAL_PERMISSIONS.visitsManage })
  .inputSchema(visitChange)
  .action(async ({ parsedInput, ctx }) => {
    const result = await visits.completeVisit(
      ctx.service,
      parsedInput.values as z.input<typeof completeVisitSchema>,
    );
    refreshDeals(parsedInput.leadId);
    return result;
  });

export const noShowVisitAction = tenantAction
  .metadata({ name: "deals.visit.no-show", permission: DEAL_PERMISSIONS.visitsManage })
  .inputSchema(visitChange)
  .action(async ({ parsedInput, ctx }) => {
    await visits.markVisitNoShow(
      ctx.service,
      parsedInput.values as z.input<typeof noShowVisitSchema>,
    );
    refreshDeals(parsedInput.leadId);
  });

export const cancelVisitAction = tenantAction
  .metadata({ name: "deals.visit.cancel", permission: DEAL_PERMISSIONS.visitsManage })
  .inputSchema(visitChange)
  .action(async ({ parsedInput, ctx }) => {
    await visits.cancelVisit(ctx.service, parsedInput.values as z.input<typeof cancelVisitSchema>);
    refreshDeals(parsedInput.leadId);
  });

export const rescheduleVisitAction = tenantAction
  .metadata({ name: "deals.visit.reschedule", permission: DEAL_PERMISSIONS.visitsManage })
  .inputSchema(visitChange)
  .action(async ({ parsedInput, ctx }) => {
    const result = await visits.rescheduleVisit(
      ctx.service,
      parsedInput.values as z.input<typeof rescheduleVisitSchema>,
    );
    refreshDeals(parsedInput.leadId);
    return result;
  });

// --- Closures (M08-11) -----------------------------------------------------------------------------------------------

export const markLostAction = tenantAction
  .metadata({ name: "deals.lead.mark-lost", permission: DEAL_PERMISSIONS.markLost })
  .inputSchema(markLostSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await closure.markLeadLost(ctx.service, parsedInput);
    refreshDeals(parsedInput.leadId);
    return result;
  });

// --- Bookings (M08-07 → M08-10) --------------------------------------------------------------------------------------

export const createBookingAction = tenantAction
  .metadata({ name: "deals.booking.create", permission: DEAL_PERMISSIONS.bookingsManage })
  .inputSchema(z.object({ values }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await bookings.createBooking(
      ctx.service,
      parsedInput.values as z.input<typeof createBookingSchema>,
    );
    refreshDeals(parsedInput.values.leadId as string);
    return result;
  });

export const updateBookingAction = tenantAction
  .metadata({ name: "deals.booking.update", permission: DEAL_PERMISSIONS.bookingsManage })
  .inputSchema(z.object({ values }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await bookings.updateBooking(
      ctx.service,
      parsedInput.values as z.input<typeof updateBookingSchema>,
    );
    refreshDeals(undefined, parsedInput.values.bookingId as string);
    return result;
  });

export const moveBookingStageAction = tenantAction
  .metadata({ name: "deals.booking.stage", permission: DEAL_PERMISSIONS.bookingsManage })
  .inputSchema(moveBookingStageSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await bookings.moveBookingToStage(ctx.service, parsedInput);
    refreshDeals(undefined, parsedInput.bookingId);
    return result;
  });

export const closeBookingAction = tenantAction
  .metadata({ name: "deals.booking.close", permission: DEAL_PERMISSIONS.bookingsClose })
  .inputSchema(closeBookingSchema)
  .action(async ({ parsedInput, ctx }) => {
    await bookings.closeBooking(ctx.service, parsedInput);
    refreshDeals(undefined, parsedInput.bookingId);
  });

/** What cancelling needs: the reasons, the statuses the lead may go back to and the default one. */
export const cancelBookingOptionsAction = tenantAction
  .metadata({ name: "deals.booking.cancel-options", permission: DEAL_PERMISSIONS.bookingsClose })
  .inputSchema(z.object({ bookingId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const booking = await bookings.getBooking(ctx.service, parsedInput.bookingId);
    const [reasons, statuses, others, backTo] = await Promise.all([
      masters.listLossReasons(ctx.service, { scope: "BOOKING_CANCELLED" }),
      listLeadStatuses(ctx.service, { activeOnly: true }),
      ctx.service.db.booking.count({
        where: {
          leadId: booking.lead.id,
          id: { not: booking.id },
          status: { in: ["ACTIVE", "CLOSED_WON"] },
        },
      }),
      bookings.statusBeforeBooking(ctx.service.db, booking.lead.id),
    ]);
    return {
      reasons: reasons.map((reason) => ({ id: reason.id, label: reason.label })),
      statuses: statuses
        .filter((status) => status.category === "OPEN" || status.category === "ACTIVE")
        .map((status) => ({ key: status.key, label: status.label, color: status.color })),
      defaultStatusKey: backTo,
      otherBookings: others,
    };
  });

export const cancelBookingAction = tenantAction
  .metadata({ name: "deals.booking.cancel", permission: DEAL_PERMISSIONS.bookingsClose })
  .inputSchema(cancelBookingSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await bookings.cancelBooking(ctx.service, parsedInput);
    refreshDeals(undefined, parsedInput.bookingId);
    return result;
  });

export const requestBookingDocumentAction = tenantAction
  .metadata({ name: "deals.booking.document.request", permission: DEAL_PERMISSIONS.bookingsManage })
  .inputSchema(requestBookingDocumentSchema)
  .action(({ parsedInput, ctx }) => files.requestBookingDocument(ctx.service, parsedInput));

export const attachBookingDocumentAction = tenantAction
  .metadata({ name: "deals.booking.document.attach", permission: DEAL_PERMISSIONS.bookingsManage })
  .inputSchema(
    z.object({ bookingId: z.uuid(), fileId: z.uuid(), title: z.string().max(120).nullish() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await files.attachBookingDocument(ctx.service, parsedInput);
    refreshDeals(undefined, parsedInput.bookingId);
    return result;
  });

export const bookingDocumentUrlAction = tenantAction
  .metadata({ name: "deals.booking.document.url", permission: DEAL_PERMISSIONS.bookingsView })
  .inputSchema(z.object({ documentId: z.uuid(), inline: z.boolean().default(false) }))
  .action(async ({ parsedInput, ctx }) => ({
    url: await files.getBookingDocumentUrl(
      ctx.service,
      parsedInput.documentId,
      parsedInput.inline ? "inline" : "attachment",
    ),
  }));

export const removeBookingDocumentAction = tenantAction
  .metadata({ name: "deals.booking.document.remove", permission: DEAL_PERMISSIONS.bookingsManage })
  .inputSchema(z.object({ documentId: z.uuid(), bookingId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await files.removeBookingDocument(ctx.service, parsedInput.documentId);
    refreshDeals(undefined, parsedInput.bookingId);
  });

// --- Settings (M08-02) -----------------------------------------------------------------------------------------------

const refreshSettings = () => revalidatePath("/settings/deals", "layout");

export const saveVisitOutcomeAction = tenantAction
  .metadata({ name: "deals.visit-outcome.save", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ outcomeId: z.uuid().nullable(), values: visitOutcomeSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.saveVisitOutcome(
      ctx.service,
      parsedInput.outcomeId,
      parsedInput.values,
    );
    refreshSettings();
    return result;
  });

export const deleteVisitOutcomeAction = tenantAction
  .metadata({ name: "deals.visit-outcome.delete", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ outcomeId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteVisitOutcome(ctx.service, parsedInput.outcomeId);
    refreshSettings();
  });

export const saveLossReasonAction = tenantAction
  .metadata({ name: "deals.loss-reason.save", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ reasonId: z.uuid().nullable(), values: lossReasonSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.saveLossReason(
      ctx.service,
      parsedInput.reasonId,
      parsedInput.values,
    );
    refreshSettings();
    return result;
  });

export const deleteLossReasonAction = tenantAction
  .metadata({ name: "deals.loss-reason.delete", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ reasonId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteLossReason(ctx.service, parsedInput.reasonId);
    refreshSettings();
  });

export const saveBookingStageAction = tenantAction
  .metadata({ name: "deals.booking-stage.save", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ stageId: z.uuid().nullable(), values: bookingStageSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.saveBookingStage(
      ctx.service,
      parsedInput.stageId,
      parsedInput.values,
    );
    refreshSettings();
    return result;
  });

export const moveBookingStageOrderAction = tenantAction
  .metadata({ name: "deals.booking-stage.move", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ stageId: z.uuid(), direction: z.enum(["up", "down"]) }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.moveBookingStageOrder(ctx.service, parsedInput.stageId, parsedInput.direction);
    refreshSettings();
  });

export const deleteBookingStageAction = tenantAction
  .metadata({ name: "deals.booking-stage.delete", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ stageId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteBookingStage(ctx.service, parsedInput.stageId);
    refreshSettings();
  });

export const saveDealSettingsAction = tenantAction
  .metadata({ name: "deals.settings.update", permission: DEAL_PERMISSIONS.mastersManage })
  .inputSchema(dealSettingsSchema.partial())
  .action(async ({ parsedInput, ctx }) => {
    await settings.updateDealSettings(ctx.service, parsedInput);
    refreshSettings();
  });

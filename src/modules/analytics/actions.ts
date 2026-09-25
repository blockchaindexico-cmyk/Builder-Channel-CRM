"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";

import { ANALYTICS_PERMISSIONS } from "./permissions";
import { deleteReportView, saveReportView } from "./server/saved-views";

export const saveReportViewAction = tenantAction
  .metadata({ name: "analytics.view.save", permission: ANALYTICS_PERMISSIONS.reportsView })
  .inputSchema(
    z.object({ report: z.string().max(40), name: z.string().max(80), query: z.string().max(2000) }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await saveReportView(ctx.service, parsedInput);
    revalidatePath("/reports", "layout");
    return result;
  });

export const deleteReportViewAction = tenantAction
  .metadata({ name: "analytics.view.delete", permission: ANALYTICS_PERMISSIONS.reportsView })
  .inputSchema(z.object({ viewId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await deleteReportView(ctx.service, parsedInput.viewId);
    revalidatePath("/reports", "layout");
  });

"use server";

import { revalidatePath } from "next/cache";

import { tenantAction } from "@/platform/actions/client";

import { ORGANIZATION_PERMISSIONS } from "./permissions";
import {
  completeLogoUploadSchema,
  organizationProfileSchema,
  requestLogoUploadSchema,
  sendTestEmailSchema,
} from "./schemas";
import * as service from "./server/service";

export const updateOrganizationProfileAction = tenantAction
  .metadata({ name: "organization.updateProfile", permission: ORGANIZATION_PERMISSIONS.manage })
  .inputSchema(organizationProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const values = await service.updateOrganizationProfile(ctx.service, parsedInput);
    revalidatePath("/", "layout");
    return values;
  });

export const requestLogoUploadAction = tenantAction
  .metadata({ name: "organization.requestLogoUpload", permission: ORGANIZATION_PERMISSIONS.manage })
  .inputSchema(requestLogoUploadSchema)
  .action(async ({ parsedInput, ctx }) => service.requestLogoUpload(ctx.service, parsedInput));

export const completeLogoUploadAction = tenantAction
  .metadata({
    name: "organization.completeLogoUpload",
    permission: ORGANIZATION_PERMISSIONS.manage,
  })
  .inputSchema(completeLogoUploadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await service.completeLogoUpload(ctx.service, parsedInput.fileId);
    revalidatePath("/", "layout");
    return result;
  });

export const removeLogoAction = tenantAction
  .metadata({ name: "organization.removeLogo", permission: ORGANIZATION_PERMISSIONS.manage })
  .action(async ({ ctx }) => {
    await service.removeLogo(ctx.service);
    revalidatePath("/", "layout");
  });

export const sendTestEmailAction = tenantAction
  .metadata({ name: "organization.sendTestEmail", permission: ORGANIZATION_PERMISSIONS.manage })
  .inputSchema(sendTestEmailSchema)
  .action(async ({ parsedInput, ctx }) => {
    await service.sendTestEmail(ctx.service, parsedInput.to);
    return { queued: true };
  });

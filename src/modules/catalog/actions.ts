"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";

import { CATALOG_PERMISSIONS } from "./permissions";
import {
  attachDocumentSchema,
  builderContactSchema,
  builderSchema,
  MASTER_KINDS,
  projectSchema,
  projectStatusSchema,
  requestDocumentUploadSchema,
} from "./schemas";
import * as builders from "./server/builders";
import * as documents from "./server/documents";
import * as masters from "./server/masters";
import * as projects from "./server/projects";

const ownerSchema = z.enum(["project", "builder"]);

// --- Builders (M03-02, M03-04) -------------------------------------------------------------------------------

export const createBuilderAction = tenantAction
  .metadata({ name: "catalog.createBuilder", permission: CATALOG_PERMISSIONS.buildersManage })
  .inputSchema(builderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await builders.createBuilder(ctx.service, parsedInput);
    revalidatePath("/builders");
    return result;
  });

export const updateBuilderAction = tenantAction
  .metadata({ name: "catalog.updateBuilder", permission: CATALOG_PERMISSIONS.buildersManage })
  .inputSchema(builderSchema.extend({ builderId: z.uuid() }))
  .action(async ({ parsedInput: { builderId, ...values }, ctx }) => {
    await builders.updateBuilder(ctx.service, builderId, values);
    revalidatePath("/builders", "layout");
    revalidatePath("/projects", "layout");
  });

export const getBuilderDeactivationImpactAction = tenantAction
  .metadata({
    name: "catalog.builderDeactivationImpact",
    permission: CATALOG_PERMISSIONS.buildersManage,
  })
  .inputSchema(z.object({ builderId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) =>
    builders.getBuilderDeactivationImpact(ctx.service, parsedInput.builderId),
  );

export const setBuilderActiveAction = tenantAction
  .metadata({ name: "catalog.setBuilderActive", permission: CATALOG_PERMISSIONS.buildersManage })
  .inputSchema(
    z.object({
      builderId: z.uuid(),
      active: z.boolean(),
      includeProjects: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await builders.setBuilderActive(
      ctx.service,
      parsedInput.builderId,
      parsedInput.active,
      {
        includeProjects: parsedInput.includeProjects,
      },
    );
    revalidatePath("/builders", "layout");
    revalidatePath("/projects", "layout");
    return result;
  });

export const deleteBuilderAction = tenantAction
  .metadata({ name: "catalog.deleteBuilder", permission: CATALOG_PERMISSIONS.buildersManage })
  .inputSchema(z.object({ builderId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await builders.deleteBuilder(ctx.service, parsedInput.builderId);
    revalidatePath("/builders");
  });

export const addBuilderContactAction = tenantAction
  .metadata({ name: "catalog.addBuilderContact", permission: CATALOG_PERMISSIONS.buildersManage })
  .inputSchema(builderContactSchema.extend({ builderId: z.uuid() }))
  .action(async ({ parsedInput: { builderId, ...values }, ctx }) => {
    const result = await builders.addBuilderContact(ctx.service, builderId, values);
    revalidatePath(`/builders/${builderId}`);
    return result;
  });

export const updateBuilderContactAction = tenantAction
  .metadata({
    name: "catalog.updateBuilderContact",
    permission: CATALOG_PERMISSIONS.buildersManage,
  })
  .inputSchema(builderContactSchema.extend({ contactId: z.uuid() }))
  .action(async ({ parsedInput: { contactId, ...values }, ctx }) => {
    await builders.updateBuilderContact(ctx.service, contactId, values);
    revalidatePath("/builders", "layout");
  });

export const deleteBuilderContactAction = tenantAction
  .metadata({
    name: "catalog.deleteBuilderContact",
    permission: CATALOG_PERMISSIONS.buildersManage,
  })
  .inputSchema(z.object({ contactId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await builders.deleteBuilderContact(ctx.service, parsedInput.contactId);
    revalidatePath("/builders", "layout");
  });

// --- Projects (M03-05, M03-09) --------------------------------------------------------------------------------

export const createProjectAction = tenantAction
  .metadata({ name: "catalog.createProject", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(projectSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await projects.createProject(ctx.service, parsedInput);
    revalidatePath("/projects");
    revalidatePath(`/builders/${parsedInput.builderId}`);
    return result;
  });

export const updateProjectAction = tenantAction
  .metadata({ name: "catalog.updateProject", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(projectSchema.extend({ projectId: z.uuid() }))
  .action(async ({ parsedInput: { projectId, ...values }, ctx }) => {
    await projects.updateProject(ctx.service, projectId, values);
    revalidatePath("/projects", "layout");
    revalidatePath("/builders", "layout");
  });

export const setProjectStatusAction = tenantAction
  .metadata({ name: "catalog.setProjectStatus", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(projectStatusSchema.extend({ projectId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await projects.setProjectStatus(ctx.service, parsedInput.projectId, parsedInput.status);
    revalidatePath("/projects", "layout");
  });

export const setProjectActiveAction = tenantAction
  .metadata({ name: "catalog.setProjectActive", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(z.object({ projectId: z.uuid(), active: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await projects.setProjectActive(ctx.service, parsedInput.projectId, parsedInput.active);
    revalidatePath("/projects", "layout");
    revalidatePath("/builders", "layout");
  });

export const getProjectUsageAction = tenantAction
  .metadata({ name: "catalog.projectUsage", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(z.object({ projectId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) =>
    projects.getProjectUsage(ctx.service, parsedInput.projectId),
  );

export const deleteProjectAction = tenantAction
  .metadata({ name: "catalog.deleteProject", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(z.object({ projectId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await projects.deleteProject(ctx.service, parsedInput.projectId);
    revalidatePath("/projects");
    revalidatePath(`/builders/${result.builderId}`);
  });

export const getProjectQuickInfoAction = tenantAction
  .metadata({ name: "catalog.projectQuickInfo", permission: CATALOG_PERMISSIONS.projectsView })
  .inputSchema(z.object({ projectId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) =>
    projects.getProjectQuickInfo(ctx.service, parsedInput.projectId),
  );

// --- Documents (M03-08) --------------------------------------------------------------------------------------

export const requestDocumentUploadAction = tenantAction
  .metadata({ name: "catalog.requestDocumentUpload" })
  .inputSchema(requestDocumentUploadSchema.extend({ owner: ownerSchema, ownerId: z.uuid() }))
  .action(async ({ parsedInput: { owner, ownerId, ...file }, ctx }) =>
    documents.requestDocumentUpload(ctx.service, owner, ownerId, file),
  );

export const attachDocumentAction = tenantAction
  .metadata({ name: "catalog.attachDocument" })
  .inputSchema(attachDocumentSchema.extend({ owner: ownerSchema, ownerId: z.uuid() }))
  .action(async ({ parsedInput: { owner, ownerId, ...values }, ctx }) => {
    const result = await documents.attachDocument(ctx.service, owner, ownerId, values);
    revalidatePath(owner === "project" ? `/projects/${ownerId}` : `/builders/${ownerId}`);
    return result;
  });

export const updateDocumentAction = tenantAction
  .metadata({ name: "catalog.updateDocument" })
  .inputSchema(
    attachDocumentSchema
      .omit({ fileId: true })
      .extend({ owner: ownerSchema, documentId: z.uuid() }),
  )
  .action(async ({ parsedInput: { owner, documentId, ...values }, ctx }) => {
    await documents.updateDocument(ctx.service, owner, documentId, values);
    revalidatePath(owner === "project" ? "/projects" : "/builders", "layout");
  });

export const removeDocumentAction = tenantAction
  .metadata({ name: "catalog.removeDocument" })
  .inputSchema(z.object({ owner: ownerSchema, documentId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await documents.removeDocument(ctx.service, parsedInput.owner, parsedInput.documentId);
    revalidatePath(parsedInput.owner === "project" ? "/projects" : "/builders", "layout");
  });

export const getDocumentUrlAction = tenantAction
  .metadata({ name: "catalog.documentUrl" })
  .inputSchema(
    z.object({
      owner: ownerSchema,
      documentId: z.uuid(),
      disposition: z.enum(["inline", "attachment"]).default("attachment"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => ({
    url: await documents.getDocumentUrl(
      ctx.service,
      parsedInput.owner,
      parsedInput.documentId,
      parsedInput.disposition,
    ),
  }));

// --- Masters (M03-10) ----------------------------------------------------------------------------------------

const masterInput = z.object({
  kind: z.enum(MASTER_KINDS),
  values: z.record(z.string(), z.unknown()),
});

export const createMasterAction = tenantAction
  .metadata({ name: "catalog.createMaster", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(masterInput)
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.createMaster(ctx.service, parsedInput.kind, parsedInput.values);
    revalidatePath("/settings/catalog", "layout");
    return result;
  });

export const updateMasterAction = tenantAction
  .metadata({ name: "catalog.updateMaster", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(masterInput.extend({ id: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.updateMaster(ctx.service, parsedInput.kind, parsedInput.id, parsedInput.values);
    revalidatePath("/settings/catalog", "layout");
  });

export const deleteMasterAction = tenantAction
  .metadata({ name: "catalog.deleteMaster", permission: CATALOG_PERMISSIONS.projectsManage })
  .inputSchema(z.object({ kind: z.enum(MASTER_KINDS), id: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteMaster(ctx.service, parsedInput.kind, parsedInput.id);
    revalidatePath("/settings/catalog", "layout");
  });

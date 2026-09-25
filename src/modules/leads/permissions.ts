/** Permission keys of lead management (M04-21). */
export const LEAD_PERMISSIONS = {
  view: "leads.view",
  create: "leads.create",
  update: "leads.update",
  changeStatus: "leads.change_status",
  statusOverride: "leads.status_override",
  reopen: "leads.reopen",
  delete: "leads.delete",
  import: "leads.import",
  export: "leads.export",
  merge: "leads.merge",
  mastersManage: "lead_masters.manage",
  apiKeysManage: "api_keys.manage",
} as const;

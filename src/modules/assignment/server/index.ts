import "./events";

import type { ServerModule } from "@/platform/registry/server";

import { assignNewLead } from "./hooks";

/** Server contributions of lead assignment (M05): who owns a lead is decided while it is created. */
export const assignmentServerModule: ServerModule = {
  key: "assignment",
  extensions: { "lead.created": [assignNewLead] },
};

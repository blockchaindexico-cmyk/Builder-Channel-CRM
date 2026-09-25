import { z } from "zod";

import { defineJob } from "@/platform/jobs/define";

import { LEAD_IMPORT_JOB, runImportBatch } from "./import/service";

/** Creates the leads of a queued import (M04-18). Retries resume after the last processed row. */
export const leadImportJob = defineJob({
  name: LEAD_IMPORT_JOB,
  description: "Import leads from an uploaded CSV/XLSX file",
  schema: z.object({ organizationId: z.uuid(), batchId: z.uuid() }),
  queue: { retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 3600 },
  handler: (data, job) => runImportBatch(data.organizationId, data.batchId, job.logger),
});

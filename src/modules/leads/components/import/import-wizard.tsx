"use client";

import { ArrowLeft, Download, FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionErrorMessage } from "@/lib/action-result";
import { cn, plural } from "@/lib/utils";

import {
  analyzeImportAction,
  previewImportAction,
  requestImportUploadAction,
  startImportAction,
} from "../../actions";
import { DUPLICATE_POLICIES, type DuplicatePolicy } from "../../constants";
import {
  IMPORT_FIELDS,
  type ImportFieldKey,
  type ImportMapping,
  MAX_IMPORT_ROWS,
} from "../../import-fields";
import { IMPORT_MAX_BYTES } from "../../schemas";
import type { AnalyzedImportFile, ImportPreview } from "../../server/import/service";

const NONE = "__none__";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TEMPLATE_EXAMPLE: Record<ImportFieldKey, string> = {
  name: "Priya Sharma",
  mobile: "+91 98200 12345",
  alternateMobile: "",
  email: "priya.sharma@example.com",
  city: "Pune",
  locality: "Baner",
  address: "",
  source: "99acres",
  campaign: "",
  subSource: "Listing 4471",
  budgetMin: "80 L",
  budgetMax: "1.1 Cr",
  propertyType: "Apartment",
  configurations: "2 BHK, 3 BHK",
  preferredLocations: "Baner, Wakad",
  purpose: "End use",
  buyingTimeline: "Within 3 months",
  temperature: "Hot",
  tags: "Loan approved",
  projects: "PRJ-0001",
  requirementNotes: "East facing, 2 parkings",
  note: "Called on Monday, site visit next week",
  owner: "",
};

function downloadTemplate() {
  const quote = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const csv = [
    IMPORT_FIELDS.map((field) => quote(field.label)).join(","),
    IMPORT_FIELDS.map((field) => quote(TEMPLATE_EXAMPLE[field.key])).join(","),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}\r\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lead-import-template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Step = "upload" | "map" | "review";

function Steps({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload file" },
    { key: "map", label: "Match columns" },
    { key: "review", label: "Check & import" },
  ];
  const current = steps.findIndex((entry) => entry.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Import steps">
      {steps.map((entry, index) => (
        <li
          key={entry.key}
          aria-current={index === current ? "step" : undefined}
          className="flex items-center gap-2"
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full border text-xs font-medium",
              index < current && "border-primary bg-primary/10 text-primary",
              index === current && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {index + 1}
          </span>
          <span className={cn(index === current ? "font-medium" : "text-muted-foreground")}>
            {entry.label}
          </span>
          {index < steps.length - 1 ? <span className="mx-1 text-muted-foreground">›</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Lead import wizard (M04-18): upload → match columns → check rows → start the background import. */
export function ImportWizard({
  sources,
  duplicatePolicy,
}: {
  sources: { id: string; name: string; type: string }[];
  duplicatePolicy: DuplicatePolicy;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<AnalyzedImportFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [defaultSourceId, setDefaultSourceId] = useState<string>(
    () => sources.find((source) => source.type === "IMPORT")?.id ?? "",
  );
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(chosen: File) {
    if (!/\.(csv|xlsx)$/i.test(chosen.name)) {
      return void toast.error("Choose a .csv or .xlsx file.");
    }
    if (chosen.size > IMPORT_MAX_BYTES) return void toast.error("The file is larger than 10 MB.");
    setBusy("Uploading…");
    try {
      const contentType = chosen.type || (/\.csv$/i.test(chosen.name) ? "text/csv" : XLSX_TYPE);
      const requested = await requestImportUploadAction({
        fileName: chosen.name,
        contentType,
        size: chosen.size,
      });
      const requestError = actionErrorMessage(requested);
      if (requestError || !requested?.data) throw new Error(requestError ?? "Upload failed.");
      const { fileId, upload: target } = requested.data;
      const response = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body: chosen,
      });
      if (!response.ok) throw new Error("The file could not be uploaded to storage.");
      setBusy("Reading the file…");
      const analyzed = await analyzeImportAction({ fileId });
      const analyzeError = actionErrorMessage(analyzed);
      if (analyzeError || !analyzed?.data) throw new Error(analyzeError ?? "Unreadable file.");
      setFile(analyzed.data);
      setMapping(analyzed.data.suggestedMapping);
      setPreview(null);
      setStep("map");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const request = () => ({
    fileId: file!.fileId,
    mapping,
    options: { defaultSourceId, skipDuplicates },
  });

  async function check() {
    setBusy("Checking rows…");
    const result = await previewImportAction(request());
    setBusy(null);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "The rows could not be checked.");
    setPreview(result.data);
    setStep("review");
  }

  async function start() {
    setBusy("Starting the import…");
    const result = await startImportAction(request());
    const error = actionErrorMessage(result);
    if (error || !result?.data) {
      setBusy(null);
      return void toast.error(error ?? "The import could not start.");
    }
    toast.success("Import started");
    router.push(`/leads/import/${result.data.batchId}`);
  }

  const sampleFor = (column: number | null | undefined) =>
    column === null || column === undefined
      ? ""
      : (file?.samples.map((row) => row[column]).find((value) => value) ?? "");
  const policy = DUPLICATE_POLICIES.find((entry) => entry.value === duplicatePolicy)!;
  const duplicateOutcome = skipDuplicates
    ? "will be skipped"
    : duplicatePolicy === "BLOCK"
      ? "will be refused (duplicate policy: block)"
      : duplicatePolicy === "FLAG"
        ? "will be imported and flagged as possible duplicates"
        : "will be imported (duplicate policy: allow)";

  return (
    <div className="space-y-6">
      <Steps step={step} />

      {step === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose a file</CardTitle>
            <CardDescription>
              CSV or Excel (.xlsx), up to 10 MB and {MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows.
              The first row must hold the column names; each following row is one lead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="lead-import-file"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) void upload(dropped);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors hover:bg-muted/50",
                dragging && "border-primary bg-primary/5",
                busy && "pointer-events-none opacity-60",
              )}
            >
              {busy ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <FileUp className="size-8 text-muted-foreground" />
              )}
              <span className="font-medium">
                {busy ?? "Drop the file here or click to choose it"}
              </span>
              <span className="text-sm text-muted-foreground">.csv or .xlsx</span>
            </label>
            <input
              ref={inputRef}
              id="lead-import-file"
              data-testid="lead-import-input"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) void upload(chosen);
              }}
            />
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download /> Download a template
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === "map" && file ? (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle>Match the columns of {file.fileName}</CardTitle>
                <CardDescription>
                  {plural(file.totalRows, "row")} found. Columns with familiar names are matched
                  already — check them and pick the rest. A name and a mobile number or e-mail are
                  required.
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={Boolean(busy)}>
                <Upload /> Choose another file
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead field</TableHead>
                      <TableHead>Column in your file</TableHead>
                      <TableHead>Example</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {IMPORT_FIELDS.map((field) => {
                      const column = mapping[field.key];
                      return (
                        <TableRow key={field.key}>
                          <TableCell className="align-top">
                            <div className="font-medium">
                              {field.label}
                              {"required" in field ? (
                                <span className="text-destructive"> *</span>
                              ) : null}
                            </div>
                            {"hint" in field ? (
                              <div className="text-xs text-muted-foreground">{field.hint}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top">
                            <Select
                              value={
                                column === null || column === undefined ? NONE : String(column)
                              }
                              onValueChange={(value) =>
                                setMapping((current) => ({
                                  ...current,
                                  [field.key]: value === NONE ? null : Number(value),
                                }))
                              }
                            >
                              <SelectTrigger
                                size="sm"
                                className="w-56"
                                aria-label={`Column for ${field.label}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>Don&apos;t import</SelectItem>
                                {file.headers.map((header, index) => (
                                  <SelectItem key={index} value={String(index)}>
                                    {header}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="max-w-64 truncate align-top text-muted-foreground">
                            {sampleFor(column)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid max-w-md gap-2">
                <Label htmlFor="import-default-source">Source for rows without one</Label>
                <Select
                  value={defaultSourceId || NONE}
                  onValueChange={(value) => setDefaultSourceId(value === NONE ? "" : value)}
                >
                  <SelectTrigger id="import-default-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No source</SelectItem>
                    {sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="import-skip-duplicates"
                  checked={skipDuplicates}
                  onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
                />
                <div className="grid gap-1">
                  <Label htmlFor="import-skip-duplicates">
                    Skip rows whose mobile or e-mail already belongs to a lead
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Otherwise the organization&apos;s duplicate policy applies ({policy.label}:{" "}
                    {policy.description.toLowerCase()})
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => void check()} disabled={Boolean(busy)}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ?? "Check rows"}
            </Button>
          </div>
        </>
      ) : null}

      {step === "review" && file && preview ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Ready to import {plural(preview.validRows, "lead")}</CardTitle>
              <CardDescription>Nothing has been imported yet.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <Badge variant="success" className="mr-2 tabular-nums">
                    {preview.validRows}
                  </Badge>{" "}
                  of {plural(preview.totalRows, "row")} can be imported.
                </li>
                {preview.errorRows ? (
                  <li>
                    <Badge variant="destructive" className="mr-2 tabular-nums">
                      {preview.errorRows}
                    </Badge>{" "}
                    {preview.errorRows === 1 ? "row has" : "rows have"} errors and will be left out
                    (you can download them after the import).
                  </li>
                ) : null}
                {preview.existingDuplicates ? (
                  <li>
                    <Badge variant="warning" className="mr-2 tabular-nums">
                      {preview.existingDuplicates}
                    </Badge>{" "}
                    {preview.existingDuplicates === 1 ? "row matches" : "rows match"} an existing
                    lead and {duplicateOutcome}.
                  </li>
                ) : null}
                {preview.fileDuplicates ? (
                  <li>
                    <Badge variant="warning" className="mr-2 tabular-nums">
                      {preview.fileDuplicates}
                    </Badge>{" "}
                    {preview.fileDuplicates === 1 ? "row repeats" : "rows repeat"} the mobile or
                    e-mail of an earlier row and {duplicateOutcome}.
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          {preview.problems.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Rows with errors</CardTitle>
                <CardDescription>
                  Fix them in your file and upload it again, or import the other rows now.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-48">Name</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.problems.map((problem) => (
                        <TableRow key={problem.row}>
                          <TableCell className="tabular-nums">{problem.row}</TableCell>
                          <TableCell>{problem.name || "—"}</TableCell>
                          <TableCell className="whitespace-normal">
                            {problem.errors.join("; ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {preview.sample.length ? (
            <Card>
              <CardHeader>
                <CardTitle>First rows as they will be imported</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {preview.sample.map((row) => (
                  <dl key={row.row} className="rounded-lg border p-3 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Row {row.row}</p>
                    {Object.entries(row.values).map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
                        <dd className="min-w-0 truncate">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setStep("map")} disabled={Boolean(busy)}>
              <ArrowLeft /> Back to columns
            </Button>
            <Button
              onClick={() => void start()}
              disabled={Boolean(busy) || preview.validRows === 0}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {busy ?? `Import ${plural(preview.validRows, "lead")}`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

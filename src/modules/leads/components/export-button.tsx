"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/utils";

import type { ExportFormat } from "../schemas";

/** Downloads an export from `/api/leads/export` (M04-19). Returns an error message, or null on success. */
async function downloadExport(body: {
  format: ExportFormat;
  query?: string;
  ids?: string[];
}): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("/api/leads/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return "The export could not be downloaded. Check your connection.";
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || contentType.includes("json") || contentType.includes("html")) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? "The export failed. Please try again.";
  }
  const blob = await response.blob();
  const fileName =
    /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
    `leads.${body.format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast.success(`Exported ${plural(Number(response.headers.get("x-lead-count") ?? 0), "lead")}`);
  return null;
}

function ExportMenu({
  label,
  run,
  size,
}: {
  label: string;
  run: (format: ExportFormat) => Promise<string | null>;
  size?: "sm";
}) {
  const [busy, setBusy] = useState(false);
  const start = async (format: ExportFormat) => {
    setBusy(true);
    const error = await run(format);
    setBusy(false);
    if (error) toast.error(error);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={busy}>
          <Download /> {busy ? "Exporting…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Download as</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void start("xlsx")}>
          <FileSpreadsheet /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void start("csv")}>
          <FileText /> CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Exports the leads of the current view, search and filters. */
export function ExportLeadsButton() {
  const params = useSearchParams();
  return (
    <ExportMenu
      label="Export"
      run={(format) => {
        const query = new URLSearchParams(params.toString());
        query.delete("page");
        query.delete("hide");
        return downloadExport({ format, query: query.toString() });
      }}
    />
  );
}

/** Exports the selected rows (bulk action). */
export function ExportSelectedButton({ ids }: { ids: string[] }) {
  return <ExportMenu size="sm" label="Export" run={(format) => downloadExport({ format, ids })} />;
}

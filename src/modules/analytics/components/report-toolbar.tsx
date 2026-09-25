"use client";

import { Bookmark, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionErrorMessage } from "@/lib/action-result";

import { deleteReportViewAction, saveReportViewAction } from "../actions";

/** Saved views and export buttons of a report page (M10-08, M10-18). */
export function ReportToolbar({
  report,
  views,
  canExport,
  exportable,
  large,
}: {
  report: string;
  views: { id: string; name: string; query: string }[];
  canExport: boolean;
  exportable: boolean;
  /** Exported in the background (the file appears under "My exports"). */
  large?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const query = new URLSearchParams(search.toString());
  query.delete("page");
  const exportHref = (format: "csv" | "xlsx") =>
    `/api/reports/export?report=${report}&format=${format}&${query.toString()}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark /> Views
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>My saved views</DropdownMenuLabel>
          {views.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">None yet.</p>
          ) : (
            views.map((view) => (
              <DropdownMenuItem key={view.id} className="justify-between" asChild>
                <div>
                  <Link
                    href={`${pathname}?${view.query}`}
                    className="flex-1 truncate"
                    onClick={() => setMenuOpen(false)}
                  >
                    {view.name}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async (event) => {
                      event.preventDefault();
                      const error = actionErrorMessage(
                        await deleteReportViewAction({ viewId: view.id }),
                      );
                      if (error) return void toast.error(error);
                      toast.success(`View "${view.name}" deleted`);
                      router.refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaving(true)}>
            Save the current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canExport && exportable ? (
        <>
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref("xlsx")}>
              <Download /> Excel
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref("csv")}>
              <Download /> CSV
            </a>
          </Button>
          {large ? (
            <span className="text-xs text-muted-foreground">Prepared in the background</span>
          ) : null}
        </>
      ) : null}
      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
          </DialogHeader>
          <form
            id="save-view-form"
            className="grid gap-1.5"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await saveReportViewAction({ report, name, query: query.toString() });
              const error = actionErrorMessage(result);
              if (error) return void toast.error(error);
              toast.success(`View "${name.trim()}" saved`);
              setSaving(false);
              setName("");
              router.refresh();
            }}
          >
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              maxLength={80}
              required
              placeholder="North team, this quarter"
              onChange={(event) => setName(event.target.value)}
            />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaving(false)}>
              Cancel
            </Button>
            <Button type="submit" form="save-view-form" disabled={name.trim().length < 2}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

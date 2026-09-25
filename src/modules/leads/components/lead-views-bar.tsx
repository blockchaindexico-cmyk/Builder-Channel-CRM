"use client";

import { Bookmark, BookmarkPlus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { deleteViewAction, saveViewAction } from "../actions";
import type { LeadView } from "../server/leads";
import type { SavedViewRow } from "../server/views";

const VIEW_LABELS: Record<LeadView, string> = {
  all: "All leads",
  my: "My leads",
  team: "Team leads",
  unassigned: "Unassigned",
  duplicates: "Duplicates",
};

/** Role-based default views and saved personal/shared views (M04-14). */
export function LeadViewsBar({
  views,
  current,
  savedViews,
  counts,
}: {
  views: LeadView[];
  current: LeadView;
  savedViews: SavedViewRow[];
  counts?: Partial<Record<LeadView, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const hrefFor = (view: LeadView) => (view === views[0] ? pathname : `${pathname}?view=${view}`);

  async function save() {
    const query = new URLSearchParams(params.toString());
    query.delete("page");
    const result = await saveViewAction({ name, query: query.toString(), isShared: shared });
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`View "${name}" saved`);
    setSaving(false);
    setName("");
    setShared(false);
    router.refresh();
  }

  async function remove(view: SavedViewRow) {
    const error = actionErrorMessage(await deleteViewAction({ viewId: view.id }));
    if (error) return void toast.error(error);
    toast.success(`View "${view.name}" deleted`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav
        aria-label="Lead views"
        className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1"
      >
        {views.map((view) => (
          <Link
            key={view}
            href={hrefFor(view)}
            aria-current={view === current ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              view === current && "bg-background text-foreground shadow-sm",
            )}
          >
            {VIEW_LABELS[view]}
            {counts?.[view] ? (
              <span className="ml-1.5 text-xs text-muted-foreground">{counts[view]}</span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Bookmark /> Saved views
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
            {savedViews.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No saved views yet.</p>
            ) : (
              savedViews.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  className="justify-between gap-2"
                  onSelect={() => router.push(`${pathname}?${view.query}`)}
                  onKeyDown={(event) => {
                    if (view.isMine && event.key === "Delete") {
                      event.preventDefault();
                      void remove(view);
                    }
                  }}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {view.isShared ? (
                      <Users className="size-4 text-muted-foreground" />
                    ) : (
                      <Bookmark className="size-4 text-muted-foreground" />
                    )}
                    <span className="truncate">{view.name}</span>
                    {!view.isMine ? (
                      <span className="truncate text-xs text-muted-foreground">
                        by {view.ownerName}
                      </span>
                    ) : null}
                  </span>
                  {view.isMine ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Delete view ${view.name}`}
                      title="Delete view (or press Delete)"
                      className="rounded-sm p-1 text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void remove(view);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSaving(true)}>
              <BookmarkPlus /> Save current view…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Keeps the current view, filters, search, sort and columns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="view-shared" checked={shared} onCheckedChange={setShared} />
              <Label htmlFor="view-shared" className="font-normal">
                Share with everyone (they still see only the leads they are allowed to)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaving(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={() => void save()}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { MessageSquare, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";

import { addNoteAction, deleteNoteAction, pinNoteAction, updateNoteAction } from "../actions";
import type { LeadNoteRow } from "../server/notes";

/** Notes & remarks (M04-09): add, edit own, pin, delete (kept for history). */
export function NotesPanel({
  leadId,
  notes,
  canWrite,
  myMembershipId,
  canDeleteAny,
}: {
  leadId: string;
  notes: LeadNoteRow[];
  canWrite: boolean;
  myMembershipId: string | null;
  canDeleteAny: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: Promise<unknown>, success: string) {
    setBusy(true);
    const error = actionErrorMessage((await action) as Parameters<typeof actionErrorMessage>[0]);
    setBusy(false);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={body}
            maxLength={5000}
            placeholder="Add a note — what was discussed, what's next…"
            aria-label="New note"
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex justify-end">
            <Button
              disabled={busy || !body.trim()}
              onClick={async () => {
                if (await run(addNoteAction({ leadId, body }), "Note added")) setBody("");
              }}
            >
              Add note
            </Button>
          </div>
        </div>
      ) : null}
      {notes.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No notes yet" />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const mine = Boolean(myMembershipId && note.authorId === myMembershipId);
            return (
              <li key={note.id} className="rounded-lg border p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{note.authorName}</span>
                    <RelativeTime value={note.createdAt} />
                    {note.editedAt ? <span>(edited)</span> : null}
                    {note.isPinned ? (
                      <Badge variant="info" className="gap-1">
                        <Pin /> Pinned
                      </Badge>
                    ) : null}
                  </span>
                  {canWrite ? (
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={note.isPinned ? "Unpin note" : "Pin note"}
                        onClick={() =>
                          void run(
                            pinNoteAction({ noteId: note.id, pinned: !note.isPinned }),
                            note.isPinned ? "Unpinned" : "Pinned",
                          )
                        }
                      >
                        {note.isPinned ? <PinOff /> : <Pin />}
                      </Button>
                      {mine ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Edit note"
                          onClick={() => setEditing({ id: note.id, body: note.body })}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      {mine || canDeleteAny ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label="Delete note">
                              <Trash2 />
                            </Button>
                          }
                          title="Delete this note?"
                          description="It disappears from the lead; the deletion stays in the timeline and audit log."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() =>
                            run(deleteNoteAction({ noteId: note.id }), "Note deleted")
                          }
                        />
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {editing?.id === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      value={editing.body}
                      aria-label="Edit note"
                      onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy || !editing.body.trim()}
                        onClick={async () => {
                          if (
                            await run(
                              updateNoteAction({ noteId: note.id, body: editing.body }),
                              "Note saved",
                            )
                          )
                            setEditing(null);
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-line">{note.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

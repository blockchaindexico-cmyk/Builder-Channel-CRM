"use client";

import { Mic, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useFormatters } from "@/components/shared/regional-settings";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import {
  attachRecordingAction,
  recordingUrlAction,
  requestRecordingUploadAction,
} from "../actions";
import { RECORDING_MAX_BYTES } from "../constants";
import type { CallRow } from "../server/calls";
import { OutcomeBadge } from "./badges";

function duration(seconds: number) {
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function RecordingControls({
  call,
  leadId,
  canListen,
  canUpload,
}: {
  call: CallRow;
  leadId: string;
  canListen: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function play() {
    setBusy(true);
    const result = await recordingUrlAction({ callId: call.id });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data)
      return void toast.error(error ?? "The recording could not be opened.");
    setSrc(result.data.url);
  }

  async function upload(file: File) {
    if (!file.type.startsWith("audio/")) return void toast.error("Choose an audio file.");
    if (file.size > RECORDING_MAX_BYTES) return void toast.error("Recordings can be up to 50 MB.");
    setBusy(true);
    try {
      const requested = await requestRecordingUploadAction({
        callId: call.id,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      const requestError = actionErrorMessage(requested);
      if (requestError || !requested?.data)
        throw new Error(requestError ?? "Upload could not start.");
      const response = await fetch(requested.data.upload.url, {
        method: requested.data.upload.method,
        headers: requested.data.upload.headers,
        body: file,
      });
      if (!response.ok) throw new Error("The recording could not be uploaded.");
      const attachError = actionErrorMessage(
        await attachRecordingAction({ callId: call.id, fileId: requested.data.fileId, leadId }),
      );
      if (attachError) throw new Error(attachError);
      toast.success("Recording added");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (call.hasRecording) {
    if (!canListen) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Mic className="size-3.5" /> Recorded
        </span>
      );
    }
    return src ? (
      <audio
        controls
        autoPlay
        src={src}
        className="h-8 w-full max-w-xs"
        aria-label="Call recording"
      />
    ) : (
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2"
        disabled={busy}
        onClick={() => void play()}
      >
        <Play /> Play recording
      </Button>
    );
  }
  if (!canUpload) return null;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        data-testid={`recording-input-${call.id}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload /> {busy ? "Uploading…" : "Add recording"}
      </Button>
    </>
  );
}

/** Each call of a lead as its own entry (PRD §8) with outcome, duration, notes and recording. */
export function CallList({
  calls,
  leadId,
  canListen,
  canUpload,
}: {
  calls: CallRow[];
  leadId: string;
  canListen: boolean;
  canUpload: boolean;
}) {
  const format = useFormatters();
  return (
    <ol className="divide-y rounded-lg border" aria-label="Calls">
      {calls.map((call) => {
        const iconClass = "mt-0.5 size-4 shrink-0";
        return (
          <li key={call.id} className="flex gap-3 px-4 py-3 text-sm">
            {!call.connected ? (
              <PhoneMissed
                className={`${iconClass} text-muted-foreground`}
                aria-label="Not reached"
              />
            ) : call.direction === "INBOUND" ? (
              <PhoneIncoming className={`${iconClass} text-success`} aria-label="Reached" />
            ) : (
              <PhoneOutgoing className={`${iconClass} text-success`} aria-label="Reached" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {call.direction === "INBOUND" ? "Incoming" : "Outgoing"}
                </span>
                <OutcomeBadge label={call.outcome.label} category={call.outcome.category} />
                {duration(call.durationSeconds) ? (
                  <span className="text-muted-foreground tabular-nums">
                    {duration(call.durationSeconds)}
                  </span>
                ) : null}
              </div>
              {call.notes ? <p className="whitespace-pre-line">{call.notes}</p> : null}
              <p className="text-xs text-muted-foreground">
                {call.callerName} · {format.dateTime(call.startedAt)} (
                <RelativeTime value={call.startedAt} />)
              </p>
              <RecordingControls
                call={call}
                leadId={leadId}
                canListen={canListen}
                canUpload={canUpload}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

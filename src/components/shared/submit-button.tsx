"use client";

import { Loader2 } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";

/** Button that shows a spinner and disables itself while a form is submitting. */
export function SubmitButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

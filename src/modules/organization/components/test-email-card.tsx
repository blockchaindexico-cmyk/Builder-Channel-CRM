"use client";

import { Send } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionErrorMessage } from "@/lib/action-result";

import { sendTestEmailAction } from "../actions";

/** Sends a test e-mail through the background worker to verify e-mail delivery. */
export function TestEmailCard({ defaultEmail }: { defaultEmail: string }) {
  const [to, setTo] = useState(defaultEmail);
  const { executeAsync, isPending } = useAction(sendTestEmailAction);

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail delivery</CardTitle>
        <CardDescription>
          Send a test message to confirm that e-mails from the CRM are delivered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await executeAsync({ to });
            const error = actionErrorMessage(result);
            if (error) toast.error(error);
            else toast.success(`Test e-mail queued for ${to}`);
          }}
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor="test-email-to">Send to</Label>
            <Input
              id="test-email-to"
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={isPending || !to}>
            <Send /> Send test e-mail
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

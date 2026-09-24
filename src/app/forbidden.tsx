import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-[60svh] items-center justify-center p-6">
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Ask your administrator to grant you the required permission."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
        className="max-w-lg border-none"
      />
    </main>
  );
}

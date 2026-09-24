import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/** Not-found inside the app shell (the shell already provides the page's `<main>` landmark). */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        description="The page you are looking for does not exist or may have been moved."
        action={
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
        className="max-w-lg border-none"
      />
    </div>
  );
}

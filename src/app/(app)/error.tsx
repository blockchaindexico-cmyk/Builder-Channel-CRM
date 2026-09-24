"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page could not be loaded"
      description={
        <>
          An unexpected error occurred. Try again, and contact your administrator if it keeps
          happening.
          {error.digest ? (
            <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
          ) : null}
        </>
      }
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

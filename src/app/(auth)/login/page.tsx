import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/modules/identity/components/auth/login-form";
import { findActiveMembership } from "@/platform/auth/membership";
import { getSession } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const notice =
    typeof params.error === "string"
      ? params.error
      : typeof params.notice === "string"
        ? params.notice
        : null;

  // Already signed in with an active membership → continue to the app.
  const session = await getSession();
  if (session && notice !== "inactive" && (await findActiveMembership(session.user.id))) {
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  }

  return <LoginForm next={next} notice={notice} />;
}

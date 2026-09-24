import type { Metadata } from "next";

import { ResetPasswordForm } from "@/modules/identity/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token.length > 10 ? params.token : null;
  return <ResetPasswordForm token={token} invite={params.invite === "1"} />;
}

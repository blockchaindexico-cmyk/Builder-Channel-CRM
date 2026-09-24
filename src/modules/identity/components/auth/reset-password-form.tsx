"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_HINT } from "@/platform/auth/password-policy";

import { newPasswordSchema } from "../../schemas";

type Values = z.infer<typeof newPasswordSchema>;

/** Choose a new password — used by the reset link and by invitations (M02-04, M02-10). */
export function ResetPasswordForm({ token, invite }: { token: string | null; invite: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Link not valid</CardTitle>
          <CardDescription>
            This link is incomplete. Request a new password reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: values.newPassword,
      token,
    });
    if (resetError) {
      setError(authErrorMessage(resetError));
      return;
    }
    router.replace("/login?notice=password-set");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {invite ? "Set up your account" : "Choose a new password"}
        </CardTitle>
        <CardDescription>
          {invite
            ? "Welcome! Choose a password to activate your account."
            : "Enter a new password for your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}{" "}
                {error.includes("expired") ? (
                  <Link href="/forgot-password" className="underline">
                    Request a new link
                  </Link>
                ) : null}
              </p>
            ) : null}
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" autoFocus {...field} />
                  </FormControl>
                  <FormDescription>{PASSWORD_HINT}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SubmitButton pending={form.formState.isSubmitting} className="w-full">
              {invite ? "Activate account" : "Save new password"}
            </SubmitButton>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

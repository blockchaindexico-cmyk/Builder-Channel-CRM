"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { SubmitButton } from "@/components/shared/submit-button";
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
import { applyActionErrors } from "@/lib/action-result";

import { updateProfileAction } from "../../actions";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().max(30),
});
type FormValues = z.infer<typeof formSchema>;

/** Own name and mobile number (M02-15). E-mail, role and manager are managed by an administrator. */
export function ProfileForm({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone: string | null;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name, phone: phone ?? "" },
  });
  const { executeAsync } = useAction(updateProfileAction);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await executeAsync(values);
    const error = applyActionErrors(form, result);
    if (error) return void toast.error(error);
    toast.success("Profile saved");
    form.reset(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel htmlFor="profile-email">E-mail</FormLabel>
          <Input id="profile-email" value={email} disabled readOnly />
          <FormDescription>Ask an administrator to change it.</FormDescription>
        </FormItem>
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mobile</FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="tel" placeholder="+91 98200 00000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save profile
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyActionErrors } from "@/lib/action-result";

import { updateRoleAction } from "../../actions";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name").max(60),
  description: z.string().trim().max(200),
});
type FormValues = z.infer<typeof formSchema>;

export function RoleDetailsForm({
  roleId,
  name,
  description,
}: {
  roleId: string;
  name: string;
  description: string | null;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name, description: description ?? "" },
  });
  const { executeAsync } = useAction(updateRoleAction);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await executeAsync({ roleId, ...values });
    const error = applyActionErrors(form, result);
    if (error) return void toast.error(error);
    toast.success("Role saved");
    form.reset(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <SubmitButton pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}

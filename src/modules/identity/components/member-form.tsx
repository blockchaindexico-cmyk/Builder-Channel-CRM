"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyActionErrors } from "@/lib/action-result";

import { createMemberAction, updateMemberAction } from "../actions";

export interface RoleOption {
  id: string;
  key: string;
  name: string;
}

export interface ManagerOption {
  membershipId: string;
  name: string;
  detail: string;
}

const NONE = "__none__";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's full name").max(120),
  email: z.string().trim(),
  phone: z.string().trim().max(30),
  roleId: z.string().min(1, "Choose a role"),
  reportsToId: z.string(),
  employeeCode: z.string().trim().max(40),
  designation: z.string().trim().max(80),
});
type FormValues = z.infer<typeof formSchema>;

export interface MemberFormDefaults {
  membershipId?: string;
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  reportsToId: string | null;
  employeeCode: string | null;
  designation: string | null;
}

/** Invite or edit a user (M02-10, M02-11). E-mail is fixed after creation (it is the login identity). */
export function MemberForm({
  defaults,
  roles,
  managers,
  onDone,
  onCancel,
}: {
  defaults?: MemberFormDefaults;
  roles: RoleOption[];
  managers: ManagerOption[];
  onDone?: (result: { membershipId: string }) => void;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(defaults?.membershipId);
  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? formSchema : formSchema.extend({ email: z.email("Enter a valid e-mail address") }),
    ),
    defaultValues: {
      name: defaults?.name ?? "",
      email: defaults?.email ?? "",
      phone: defaults?.phone ?? "",
      roleId: defaults?.roleId ?? roles.find((role) => role.key === "executive")?.id ?? "",
      reportsToId: defaults?.reportsToId ?? NONE,
      employeeCode: defaults?.employeeCode ?? "",
      designation: defaults?.designation ?? "",
    },
  });
  const create = useAction(createMemberAction);
  const update = useAction(updateMemberAction);
  const managerOptions = managers.filter(
    (manager) => manager.membershipId !== defaults?.membershipId,
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      phone: values.phone,
      roleId: values.roleId,
      reportsToId: values.reportsToId === NONE ? "" : values.reportsToId,
      employeeCode: values.employeeCode,
      designation: values.designation,
    };
    if (isEdit && defaults?.membershipId) {
      const result = await update.executeAsync({ membershipId: defaults.membershipId, ...payload });
      const error = applyActionErrors(form, result);
      if (error) return void toast.error(error);
      toast.success("Changes saved");
      form.reset(values);
      onDone?.({ membershipId: defaults.membershipId });
      return;
    }
    const result = await create.executeAsync({ ...payload, email: values.email });
    const error = applyActionErrors(form, result);
    if (error) return void toast.error(error);
    if (result?.data?.invitationSent)
      toast.success(`Invitation sent to ${result.data.member.email}`);
    else
      toast.warning(
        "User created, but the invitation e-mail could not be sent. Use “Resend invitation”.",
      );
    if (result?.data) onDone?.({ membershipId: result.data.member.membershipId });
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
                <Input autoFocus={!isEdit} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" disabled={isEdit} {...field} />
              </FormControl>
              {isEdit ? (
                <FormDescription>Used to sign in; cannot be changed.</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mobile</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="+91 98200 00000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reportsToId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reports to</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>No manager</SelectItem>
                  {managerOptions.map((manager) => (
                    <SelectItem key={manager.membershipId} value={manager.membershipId}>
                      {manager.name} · {manager.detail}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="designation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Designation</FormLabel>
              <FormControl>
                <Input placeholder="Sales Executive" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="employeeCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Employee code</FormLabel>
              <FormControl>
                <Input placeholder="EMP-012" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 sm:col-span-2">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <SubmitButton
            pending={form.formState.isSubmitting}
            disabled={isEdit && !form.formState.isDirty}
          >
            {isEdit ? "Save changes" : "Invite user"}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}

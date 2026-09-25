"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { applyActionErrors } from "@/lib/action-result";

import { createBuilderAction, updateBuilderAction } from "../../actions";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter the builder's name").max(120),
  code: z.string().trim().max(20),
  legalName: z.string().trim().max(160),
  website: z.string().trim().max(500),
  email: z.string().trim().max(200),
  phone: z.string().trim().max(30),
  taxId: z.string().trim().max(30),
  addressLine: z.string().trim().max(200),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  postalCode: z.string().trim().max(12),
  description: z.string().trim().max(2000),
});
type FormValues = z.infer<typeof formSchema>;

export interface BuilderFormDefaults {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  description: string | null;
}

const TEXT_FIELDS: {
  name: keyof FormValues;
  label: string;
  placeholder?: string;
  span?: boolean;
  type?: string;
}[] = [
  { name: "legalName", label: "Legal name", span: true },
  { name: "website", label: "Website", placeholder: "https://", type: "url" },
  { name: "email", label: "E-mail", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "taxId", label: "GSTIN / tax ID" },
  { name: "addressLine", label: "Address", span: true },
  { name: "city", label: "City" },
  { name: "state", label: "State" },
  { name: "postalCode", label: "PIN code" },
];

/** Add or edit a builder (M03-03). */
export function BuilderFormDialog({ builder }: { builder?: BuilderFormDefaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(builder);
  const empty = Object.fromEntries(
    Object.keys(formSchema.shape).map((key) => [key, ""]),
  ) as FormValues;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: builder
      ? (Object.fromEntries(
          Object.keys(formSchema.shape).map((key) => [
            key,
            (builder as unknown as Record<string, string | null>)[key] ?? "",
          ]),
        ) as FormValues)
      : empty,
  });
  const create = useAction(createBuilderAction);
  const update = useAction(updateBuilderAction);

  const onSubmit = form.handleSubmit(async (values) => {
    if (builder) {
      const result = await update.executeAsync({ builderId: builder.id, ...values });
      const error = applyActionErrors(form, result);
      if (error) return void toast.error(error);
      toast.success("Builder saved");
      setOpen(false);
      router.refresh();
      return;
    }
    const result = await create.executeAsync(values);
    const error = applyActionErrors(form, result);
    if (error) return void toast.error(error);
    toast.success(`${values.name} added as ${result?.data?.code}`);
    setOpen(false);
    form.reset(empty);
    if (result?.data) router.push(`/builders/${result.data.id}`);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> Add builder
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${builder?.name}` : "Add builder"}</DialogTitle>
          <DialogDescription>
            Only the name is required; add the rest when you have it.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="Skyline Developers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={isEdit ? undefined : "Generated if blank"}
                      className="uppercase placeholder:normal-case"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Short unique code, e.g. SKYLINE.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {TEXT_FIELDS.map((entry) => (
              <FormField
                key={entry.name}
                control={form.control}
                name={entry.name}
                render={({ field }) => (
                  <FormItem className={entry.span ? "sm:col-span-2" : undefined}>
                    <FormLabel>{entry.label}</FormLabel>
                    <FormControl>
                      <Input
                        type={entry.type ?? "text"}
                        placeholder={entry.placeholder}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Reputation, past projects, how we work with them…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pending={form.formState.isSubmitting}>
                {isEdit ? "Save" : "Add builder"}
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

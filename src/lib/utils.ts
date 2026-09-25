import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind class names, resolving conflicts (`cn("p-2", cond && "p-4")`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Initials for avatars, e.g. "Asha Mehta" → "AM". */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
      .filter(Boolean)
      .slice(0, 2)
      .map((letter) => letter.toUpperCase())
      .join("") || "?"
  );
}

/** "1 lead", "3 leads", "2 statuses" — the count followed by the singular or plural noun. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

"use client";

import { useFormatters } from "@/components/shared/regional-settings";

/** "₹85L – ₹1.4Cr" (compact) or "₹85,00,000 – ₹1,40,00,000". Money values are decimal strings. */
export function PriceRange({
  min,
  max,
  compact = true,
  empty = "Price on request",
}: {
  min: string | null;
  max: string | null;
  compact?: boolean;
  empty?: string;
}) {
  const format = useFormatters();
  if (!min && !max) return <span className="text-muted-foreground">{empty}</span>;
  const money = (value: string) => format.money(value, { compact });
  if (min && max && min !== max) {
    return (
      <span className="whitespace-nowrap">
        {money(min)} – {money(max)}
      </span>
    );
  }
  return <span className="whitespace-nowrap">{money((min ?? max)!)}</span>;
}

/** "650 – 720 sq ft" */
export function AreaRange({ min, max }: { min: string | null; max: string | null }) {
  const format = useFormatters();
  if (!min && !max) return <span className="text-muted-foreground">—</span>;
  const area = (value: string) => format.number(Number(value), { maximumFractionDigits: 2 });
  return (
    <span className="whitespace-nowrap">
      {min && max && min !== max ? `${area(min)} – ${area(max)}` : area((min ?? max)!)} sq ft
    </span>
  );
}

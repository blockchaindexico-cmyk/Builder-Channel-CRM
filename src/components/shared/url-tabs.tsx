"use client";

import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Page sections as tabs; the open tab is kept in `?tab=` so it can be linked to and survives reloads. */
export function UrlTabs({
  tabs,
}: {
  tabs: { value: string; label: string; content: ReactNode }[];
}) {
  const first = tabs[0]?.value ?? "";
  const [tab, setTab] = useQueryState("tab", parseAsString.withDefault(first));
  const current = tabs.some((item) => item.value === tab) ? tab : first;
  return (
    <Tabs value={current} onValueChange={(value) => void setTab(value === first ? null : value)}>
      <TabsList className="mb-4 max-w-full overflow-x-auto">
        {tabs.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((item) => (
        <TabsContent key={item.value} value={item.value} className="space-y-6">
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

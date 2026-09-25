"use client";

import { Building, PanelRightOpen } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceRange, ProjectQuickInfoSheet, ProjectStatusBadge } from "@/modules/catalog/client";

import { INTEREST_LEVELS } from "../constants";
import type { LeadDetail } from "../server/leads";

/** Projects of interest (M04-07) with the project quick-info drawer from M03 for answering questions on calls. */
export function InterestsCard({ interests }: { interests: LeadDetail["interests"] }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="size-4 text-primary" /> Projects of interest
        </CardTitle>
      </CardHeader>
      <CardContent>
        {interests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects linked yet.</p>
        ) : (
          <ul className="space-y-3">
            {interests.map((interest) => (
              <li
                key={interest.projectId}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {interest.project.name}
                    <ProjectStatusBadge status={interest.project.status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {interest.project.builder.name}
                    {interest.project.city
                      ? ` · ${[interest.project.locality, interest.project.city].filter(Boolean).join(", ")}`
                      : ""}
                  </p>
                  <p className="text-xs">
                    <PriceRange min={interest.project.priceMin} max={interest.project.priceMax} />{" "}
                    <Badge variant="muted" className="ml-1">
                      {INTEREST_LEVELS.find((level) => level.value === interest.level)?.label}{" "}
                      interest
                    </Badge>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quick view of ${interest.project.name}`}
                  onClick={() => setProjectId(interest.projectId)}
                >
                  <PanelRightOpen />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ProjectQuickInfoSheet
        projectId={projectId}
        onOpenChange={(open) => !open && setProjectId(null)}
      />
    </Card>
  );
}

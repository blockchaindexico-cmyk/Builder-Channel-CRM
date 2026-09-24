import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

import type { TeamNode } from "../server/team";
import { MemberStatusBadge } from "./member-status-badge";

function countDescendants(node: TeamNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function NodeCard({ node, linkBase }: { node: TeamNode; linkBase?: string }) {
  const name = linkBase ? (
    <Link href={`${linkBase}/${node.membershipId}`} className="hover:underline">
      {node.name}
    </Link>
  ) : (
    node.name
  );
  const descendants = countDescendants(node);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-xs text-primary">
          {initials(node.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {name}
          {node.status !== "ACTIVE" ? <MemberStatusBadge status={node.status} /> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {node.designation ?? node.roleName}
          {node.designation && node.designation !== node.roleName ? ` · ${node.roleName}` : ""}
        </p>
      </div>
      {descendants > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {node.children.length} direct · {descendants} total
        </span>
      ) : null}
    </div>
  );
}

function TreeNode({ node, linkBase, depth }: { node: TeamNode; linkBase?: string; depth: number }) {
  if (node.children.length === 0) {
    return (
      <li className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60">
        <span className="size-4 shrink-0" aria-hidden />
        <NodeCard node={node} linkBase={linkBase} />
      </li>
    );
  }
  return (
    <li>
      <details open={depth < 2} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <NodeCard node={node} linkBase={linkBase} />
        </summary>
        <ul className="ml-4 border-l pl-3">
          {node.children.map((child) => (
            <TreeNode key={child.membershipId} node={child} linkBase={linkBase} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** Reporting structure (M02-14): collapsible manager → team tree. */
export function TeamTree({ roots, linkBase }: { roots: TeamNode[]; linkBase?: string }) {
  return (
    <ul className="space-y-1" aria-label="Reporting structure">
      {roots.map((node) => (
        <TreeNode key={node.membershipId} node={node} linkBase={linkBase} depth={0} />
      ))}
    </ul>
  );
}

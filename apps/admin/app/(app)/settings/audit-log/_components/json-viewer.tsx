"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@staffly/ui";

type Json = unknown;

function isExpandable(v: Json): v is Record<string, Json> | Json[] {
  return v !== null && typeof v === "object";
}

function preview(v: Json): string {
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (isExpandable(v)) return `{${Object.keys(v).length}}`;
  return "";
}

function Leaf({ value }: { value: Json }): React.ReactNode {
  if (value === null)
    return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === "string")
    return (
      <span className="text-emerald-600 dark:text-emerald-400">
        &quot;{value}&quot;
      </span>
    );
  if (typeof value === "number")
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  if (typeof value === "boolean")
    return (
      <span className="text-purple-600 dark:text-purple-400">
        {String(value)}
      </span>
    );
  return <span>{String(value)}</span>;
}

function Node({
  name,
  value,
  depth,
  defaultOpen,
}: {
  name?: string;
  value: Json;
  depth: number;
  defaultOpen: boolean;
}): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen);

  if (!isExpandable(value)) {
    return (
      <div className="flex gap-2" style={{ paddingLeft: depth * 14 }}>
        {name !== undefined ? (
          <span className="text-muted-foreground">{name}:</span>
        ) : null}
        <Leaf value={value} />
      </div>
    );
  }

  const entries: [string, Json][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded text-left hover:bg-accent/40"
        style={{ paddingLeft: depth * 14 }}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {name !== undefined ? (
          <span className="text-muted-foreground">{name}:</span>
        ) : null}
        <span className="text-muted-foreground">{preview(value)}</span>
      </button>
      {open ? (
        <div>
          {entries.length === 0 ? (
            <div
              className="text-muted-foreground italic"
              style={{ paddingLeft: (depth + 1) * 14 }}
            >
              empty
            </div>
          ) : (
            entries.map(([k, v]) => (
              <Node
                key={k}
                name={k}
                value={v}
                depth={depth + 1}
                defaultOpen={depth < 1}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function JsonViewer({
  value,
  className,
}: {
  value: Json;
  className?: string;
}): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground italic",
          className,
        )}
      >
        No data
      </div>
    );
  }
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed",
        className,
      )}
    >
      <Node value={value} depth={0} defaultOpen />
    </div>
  );
}

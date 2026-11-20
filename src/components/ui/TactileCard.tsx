import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function TactileCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tactile-card p-6", className)} {...props} />;
}
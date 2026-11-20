import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

export function TactileButton({
  className,
  type = "button",
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[12px]",
        "border border-line border-b-[3px] border-b-amber-edge bg-amber px-4 py-2.5",
        "text-sm font-semibold text-on-amber shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
        "transition-transform active:translate-y-[2px]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
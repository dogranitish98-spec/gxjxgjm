import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  className,
  id,
  disabled,
  "aria-labelledby": ariaLabelledby,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-border transition-[background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-foreground data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted",
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-1 rounded-full bg-foreground shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary-foreground" />
    </SwitchPrimitive.Root>
  );
}

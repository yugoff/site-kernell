import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all rounded-md disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
};

const sizes = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
  lg: "h-10 px-6 has-[>svg]:px-4",
};

type Common = { variant?: keyof typeof variants; size?: keyof typeof sizes };
type ButtonProps = (React.ComponentProps<"button"> & Common & { href?: undefined }) |
  (React.ComponentProps<"a"> & Common & { href: string });

/** Кнопка; если передан href — рендерится ссылкой с теми же стилями. */
export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);
  if (props.href !== undefined) {
    return <a className={classes} {...(props as React.ComponentProps<"a">)} />;
  }
  return <button className={classes} {...(props as React.ComponentProps<"button">)} />;
}

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-foreground text-background focus:ring-foreground/30 hover:bg-foreground/90",
        secondary:
          "border border-border bg-background text-foreground focus:ring-foreground/20 hover:bg-surface-hover",
        ghost: "text-foreground hover:bg-surface-hover focus:ring-foreground/20",
        danger:
          "border border-danger/20 bg-danger/10 text-danger focus:ring-danger/30 hover:bg-danger/20",
        success:
          "border border-success/20 bg-success/10 text-success focus:ring-success/30 hover:bg-success/20",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-9 rounded-md px-4 text-sm",
        lg: "h-10 rounded-lg px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

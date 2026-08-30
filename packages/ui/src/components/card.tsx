import { cn } from "../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    hoverable?: boolean;
}

export function Card({ className, hoverable, ...props }: CardProps) {
    return (
        <div
            className={cn(
                "rounded-lg border border-border bg-background",
                hoverable && "transition-shadow hover:shadow-sm",
                className,
            )}
            {...props}
        />
    );
}

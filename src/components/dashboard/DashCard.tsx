import React from "react";

interface DashCardProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export default function DashCard({ title = null, action = null, children, className = "" }: DashCardProps) {
  return (
    <div className={`bg-card rounded-xl border border-border p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-sm font-semibold font-heading text-card-foreground">
              {title}
            </h3>
          )}
          {action && <div className="flex items-center gap-1">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

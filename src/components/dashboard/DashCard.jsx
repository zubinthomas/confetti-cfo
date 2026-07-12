import React from "react";

export default function DashCard({ title = null, action = null, children, className = "" }) {
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

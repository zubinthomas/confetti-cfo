import React from "react";

export interface FormFieldProps {
  label: string;
  name: string;
  value: string | number;
  onChange: (name: string, value: string) => void;
  type?: string;
  options?: string[] | null;
  /** Disabled/placeholder first option shown when a select has no value yet. */
  placeholder?: string;
  disabled?: boolean;
}

// Module-scope (stable identity) so it never remounts when the parent form
// re-renders on every keystroke - a component redefined inside a render
// body gets a new type each render, which makes React unmount/remount it
// and drop input focus.
export default function FormField({
  label, name, value, onChange, type = "text", options = null, placeholder, disabled = false,
}: FormFieldProps) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {options ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
      )}
    </div>
  );
}

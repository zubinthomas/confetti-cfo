import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

// Every primitive field on a record, lowercased and space-joined - the
// default search haystack when the caller doesn't supply getSearchableText.
function defaultSearchableText(record: Record<string, unknown>): string {
  return Object.values(record)
    .filter((v) => v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
    .join(" ")
    .toLowerCase();
}

export interface SearchableSelectProps<T> {
  records: T[];
  value: string;
  onChange: (value: string, record: T | undefined) => void;
  getValue: (record: T) => string;
  getLabel: (record: T) => string;
  /** List-item React key; defaults to getValue. Override with a true unique
   *  id when getValue is a display field that could collide (e.g. a name). */
  getKey?: (record: T) => string;
  /** Optional muted second line per item (e.g. a subtitle like division/role). */
  getDescription?: (record: T) => string | null | undefined;
  /** Defaults to searching every primitive field on the record. */
  getSearchableText?: (record: T) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A combobox that searches across every field of each record (not just its
 * display label) - e.g. typing an employee's role, phone number, or division
 * finds them even though only their name is shown. Built on the existing
 * Popover + Command (cmdk) primitives; filtering is done here (not by cmdk's
 * built-in fuzzy match) so the "search everything" behavior is explicit and
 * doesn't depend on cmdk's internal scoring.
 */
export default function SearchableSelect<T>({
  records, value, onChange, getValue, getLabel, getKey, getDescription, getSearchableText,
  placeholder = "Select…", searchPlaceholder = "Search…", emptyMessage = "No matches found.",
  disabled = false, className,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const searchOf = getSearchableText ?? ((r: T) => defaultSearchableText(r as Record<string, unknown>));

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return records;
    return records.filter((r) => {
      const haystack = searchOf(r);
      return tokens.every((t) => haystack.includes(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, query]);

  const selected = records.find((r) => getValue(r) === value);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? getLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filtered.map((r) => {
                const v = getValue(r);
                const k = getKey ? getKey(r) : v;
                const description = getDescription?.(r);
                return (
                  <CommandItem key={k} value={v} onSelect={() => { onChange(v, r); setOpen(false); setQuery(""); }}>
                    <Check className={cn("h-4 w-4", v === value ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{getLabel(r)}</span>
                      {description && <span className="text-xs text-muted-foreground truncate">{description}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

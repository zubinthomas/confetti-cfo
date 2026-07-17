import { Loader2 } from "lucide-react";

/** Loading placeholder shown while a page's data hooks are still fetching. */
export default function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

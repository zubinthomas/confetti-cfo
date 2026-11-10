import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ResetLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: string;
  expiresInMinutes: number;
}

/**
 * Shows a freshly admin-generated password reset link for copying - not
 * built on ConfirmDialog, since this has nothing to confirm, just a
 * copyable result to hand to the user through whatever channel.
 */
export default function ResetLinkDialog({ open, onOpenChange, link, expiresInMinutes }: ResetLinkDialogProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setCopied(false); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Password reset link</DialogTitle>
          <DialogDescription>
            Expires in {expiresInMinutes} minutes. Share it with the user through any channel.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            readOnly value={link} onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
          />
          <Button type="button" variant="outline" onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

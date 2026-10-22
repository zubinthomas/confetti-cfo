import React from "react";
import { Boxes } from "lucide-react";
import SpotlightSearchButton from "@/components/SpotlightSearchButton";
import { BackToDashboard, CompactUserMenu } from "@/components/ModuleHeaderNav";
import InventoryTab from "@/components/inventory/InventoryTab";

export default function Inventory() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground tracking-tight flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" /> Inventory
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Stock levels by department</p>
          </div>
          <SpotlightSearchButton className="ml-auto" />
          <CompactUserMenu />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <InventoryTab />
      </div>
    </div>
  );
}

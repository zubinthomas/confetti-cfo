import React from "react";
import { ShieldCheck } from "lucide-react";
import SpotlightSearchButton from "@/components/SpotlightSearchButton";
import { BackToDashboard, CompactUserMenu } from "@/components/ModuleHeaderNav";
import ComplianceTab from "@/components/hr/ComplianceTab";

export default function Compliance() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Compliance
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Licences & Permits · Kolkata, Birbhum & all locations</p>
          </div>
          <SpotlightSearchButton className="ml-auto" />
          <CompactUserMenu />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <ComplianceTab />
      </div>
    </div>
  );
}
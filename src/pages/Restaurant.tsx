import React from "react";
import { CalendarDays } from "lucide-react";
import SpotlightSearchButton from "@/components/SpotlightSearchButton";
import { BackToDashboard, CompactUserMenu } from "@/components/ModuleHeaderNav";
import ReservationsTab from "@/components/reservations/ReservationsTab";

export default function Restaurant() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground tracking-tight flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" /> Restaurant
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Bookings, guest arrivals and floor status for Sienna</p>
          </div>
          <SpotlightSearchButton className="ml-auto" />
          <CompactUserMenu />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <ReservationsTab />
      </div>
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import ReservationsTab from "@/components/reservations/ReservationsTab";

export default function Reservations() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> CFO Dashboard
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground tracking-tight flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" /> Reservations
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Bookings, guest arrivals and floor status for Sienna</p>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <ReservationsTab />
      </div>
    </div>
  );
}

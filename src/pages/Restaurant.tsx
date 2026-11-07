import React, { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Grid2x2 } from "lucide-react";
import SpotlightSearchButton from "@/components/SpotlightSearchButton";
import { BackToDashboard, CompactUserMenu } from "@/components/ModuleHeaderNav";
import ReservationsTab from "@/components/reservations/ReservationsTab";
import { useAuth } from "@/lib/AuthContext";
import { useIsTabletOrSmaller } from "@/hooks/useIsTabletOrSmaller";

export default function Restaurant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const canFloorView = can("Reservation", "read");
  const isTabletOrSmaller = useIsTabletOrSmaller();
  const stayClassic = searchParams.get("classic") === "1";

  // Floor View (src/pages/RestaurantFloorView.tsx) is the default landing
  // screen on a phone or tablet - a fast, glanceable floor glance for staff
  // at a host stand, not the full dashboard. Its own "Switch to classic
  // view"/back controls add ?classic=1 so this redirect doesn't bounce them
  // straight back.
  useEffect(() => {
    if (canFloorView && isTabletOrSmaller && !stayClassic) {
      navigate("/restaurant/floor", { replace: true });
    }
  }, [canFloorView, isTabletOrSmaller, stayClassic, navigate]);

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
          {canFloorView && (
            <Link
              to="/restaurant/floor"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted ml-auto"
            >
              <Grid2x2 className="w-4 h-4" /> Floor View
            </Link>
          )}
          <SpotlightSearchButton className={canFloorView ? "" : "ml-auto"} />
          <CompactUserMenu />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <ReservationsTab />
      </div>
    </div>
  );
}

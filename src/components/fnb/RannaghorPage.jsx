import React from "react";
import OutletPage, { MenuMixCard } from "./OutletPage";
import { menuMix } from "@/data/financialData";

export default function RannaghorPage() {
  return (
    <OutletPage
      outletKey="rannaghor"
      heading="Rannaghor"
      description="Rannaghor is the events kitchen — most of its revenue arrives through event bookings (it also appears as an 'Events' line for the other outlets)."
    >
      <MenuMixCard items={menuMix("rannaghor")} title="Direct Menu Sales (Sep 2025 onwards)" />
    </OutletPage>
  );
}

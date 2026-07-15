import React from "react";
import OutletPage, { MenuMixCard } from "./OutletPage";
import { menuMix } from "@/data/fnbOutletData";

export default function RestaurantPage() {
  return (
    <OutletPage
      outletKey="dinningRoom"
      heading="Restaurant (Dinning Room)"
      description="The dining room - Baro/Chotto plates, sharing portions, bar bites and most of the liquor programme."
    >
      <MenuMixCard items={menuMix("dinningRoom")} title="Menu Mix - Top Sellers (Sep 2025 onwards)" />
    </OutletPage>
  );
}

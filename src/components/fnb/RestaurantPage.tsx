import React from "react";
import OutletPage, { MenuMixCard } from "./OutletPage";
import { useOutletData } from "@/hooks/useOutletData";

export default function RestaurantPage() {
  const outletData = useOutletData("dinningRoom");
  return (
    <OutletPage
      outletKey="dinningRoom"
      heading="Restaurant (Dinning Room)"
      description="The dining room - Baro/Chotto plates, sharing portions, bar bites and most of the liquor programme."
    >
      <MenuMixCard items={outletData?.menuMix ?? []} title="Menu Mix - Top Sellers (Sep 2025 onwards)" />
    </OutletPage>
  );
}

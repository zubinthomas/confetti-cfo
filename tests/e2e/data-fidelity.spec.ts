// End-to-end data-fidelity tests: open the real dashboard pages in a browser
// and assert that the numbers on screen equal aggregates computed straight
// from the Excel workbooks in data-sources/ (bypassing the app's own data
// pipeline entirely).
//
// Requires the data-sources/ folder (git-ignored) to be present locally;
// tests are skipped when it isn't.
import { test, expect } from "@playwright/test";
import {
  hasSources, L,
  ceplRowTotal, cafeOutletWeeklyTotal, siennaChannelYearTotals, consignmentYearTotal,
} from "./helpers/excel.js";

test.skip(!hasSources(), "data-sources/ workbooks not present");

// A KpiCard renders <div><p>{label}</p><p>{value}</p>…</div>; grab the value
// that follows an exact label match.
import type { Page } from "@playwright/test";

const kpi = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");

test.describe("Overview page vs CEPL workbook", () => {
  test("group KPIs match the F&B and Store sheets", async ({ page }) => {
    const fbRevenue = await ceplRowTotal("F&B", "Total F&B Sales Monthwise");
    const fbPL = await ceplRowTotal("F&B", "P+L = Gross Revenue - Operating Costs");
    const storeRevenue = await ceplRowTotal("Store", "Retails Sales Report");

    await page.goto("/");
    await expect(kpi(page, "F&B Revenue (FY 25-26)")).toHaveText(L(fbRevenue));
    await expect(kpi(page, "F&B Net Profit (FY)")).toHaveText(L(fbPL));
    await expect(kpi(page, "Store Revenue (FY 25-26)")).toHaveText(L(storeRevenue));
  });
});

test.describe("F&B pages vs CEPL F&B sheet", () => {
  test("F&B P&L annual revenue and profit", async ({ page }) => {
    const revenue = await ceplRowTotal("F&B", "Total F&B Sales Monthwise");
    const pl = await ceplRowTotal("F&B", "P+L = Gross Revenue - Operating Costs");

    await page.goto("/fnb");
    await expect(kpi(page, "Annual F&B Revenue")).toHaveText(L(revenue));
    await expect(kpi(page, "Annual Net Profit")).toHaveText(L(pl));
  });

  test("Bar: annual Retail & Bar Sales line", async ({ page }) => {
    const retailBar = await ceplRowTotal("F&B", "F&B Retail & Bar Sales");
    await page.goto("/fnb/bar");
    await expect(kpi(page, "Retail & Bar Revenue (FY)")).toHaveText(`₹${L(retailBar)}`);
  });

  test("Events: annual Event & Catering line", async ({ page }) => {
    const events = await ceplRowTotal("F&B", "F&B Event & Catering Receipt");
    await page.goto("/fnb/events");
    await expect(kpi(page, "Event & Catering (FY)")).toHaveText(`₹${L(events)}`);
  });
});

test.describe("F&B outlet pages vs Cafe weekly workbook", () => {
  for (const [route, label, outletHeader] of [
    ["/fnb/cafe", "Cafe", "Bosar Ghor"],
    ["/fnb/restaurant", "Restaurant", "Dinning Room"],
    ["/fnb/rannaghor", "Rannaghor", "Rannaghor"],
  ]) {
    test(`${label}: weekly revenue total equals the ${outletHeader} column`, async ({ page }) => {
      const revenue = await cafeOutletWeeklyTotal(outletHeader, "Total Cafe Sales");
      await page.goto(route);
      await expect(kpi(page, "Revenue (Sep–Jan)")).toHaveText(`₹${L(revenue)}`);
    });
  }
});

test.describe("Craft department pages vs CEPL sheets", () => {
  for (const [route, sheet] of [
    ["/crafts/pottery", "Pottery"],
    ["/crafts/batik", "Batik"],
    ["/crafts/stitching", "Stitching"],
    ["/crafts/trading-items", "Trading Items"],
  ]) {
    test(`${sheet}: FY revenue equals the sheet's Total Sales row`, async ({ page }) => {
      const revenue = await ceplRowTotal(sheet, "Total Sales");
      await page.goto(route);
      await expect(kpi(page, "Revenue (FY 25-26)")).toHaveText(`₹${L(revenue)}`);
    });
  }
});

test.describe("Store pages vs Sienna workbook", () => {
  test("Store P&L: FY channel revenue from the Overall sales block", async ({ page }) => {
    const channels = await siennaChannelYearTotals("25"); // FY 2025-26 block
    const total = Object.values(channels).reduce((a: number, b) => a + b, 0);

    await page.goto("/store");
    await expect(kpi(page, "HP Store Revenue (FY)")).toHaveText(L(channels["HP Store"]));
    await expect(kpi(page, "Total Store Revenue (FY)")).toHaveText(L(total));
  });

  test("Consignment: FY 25-26 partner sales total", async ({ page }) => {
    const total = await consignmentYearTotal("25");
    await page.goto("/store/consignment");
    await expect(kpi(page, "Consignment Sales (FY 25-26)")).toHaveText(`₹${L(total)}`);
  });
});

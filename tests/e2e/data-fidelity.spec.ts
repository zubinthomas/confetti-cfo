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
  ceplRowTotal, cafeOutletWeeklyTotal, cafeEarlyWeeklyTotal, siennaChannelYearTotals, consignmentYearTotal,
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

  test("Bar: Apr-Aug liquor sales, whole-cafe weekly detail", async ({ page }) => {
    const liquor = await cafeEarlyWeeklyTotal("Liquor");
    await page.goto("/fnb/bar");
    await expect(kpi(page, "Liquor Sales (Apr–Aug)")).toHaveText(`₹${L(liquor)}`);
  });

  test("Events: annual Event & Catering line", async ({ page }) => {
    const events = await ceplRowTotal("F&B", "F&B Event & Catering Receipt");
    await page.goto("/fnb/events");
    await expect(kpi(page, "Event & Catering (FY)")).toHaveText(`₹${L(events)}`);
  });

  test("Events: Apr-Aug event sales, whole-cafe weekly detail", async ({ page }) => {
    const events = await cafeEarlyWeeklyTotal("Cafe Event Sales");
    await page.goto("/fnb/events");
    await expect(kpi(page, "Event Sales (Apr–Aug)")).toHaveText(`₹${L(events)}`);
    // sparse (event weeks aren't every week) - the section should still render
    await expect(page.getByText("Whole-Cafe Weekly Event Sales", { exact: false })).toBeVisible();
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

  // Before the Sept 2025 outlet split, only the Cafe page shows a whole-cafe
  // section (Restaurant/Rannaghor have no pre-split data of their own - see
  // "F&B outlet pages need no pre-split section" below). It renders at
  // weekly, not monthly, granularity - the underlying total is already
  // fidelity-checked via the Bar/Events Apr-Aug KPIs above (same
  // CAFE_EARLY_WEEKLY data source), so this just confirms the section
  // actually renders with real per-week ticks rather than 5 month labels.
  test("Cafe: pre-split section renders at weekly granularity", async ({ page }) => {
    await page.goto("/fnb/cafe");
    const card = page.getByText("Whole-Cafe Weekly P&L", { exact: false });
    await expect(card).toBeVisible();
    // a real week-date tick ("31/03") should be on screen, not a month name
    await expect(page.getByText("31/03", { exact: true })).toBeVisible();
  });
});

test.describe("F&B outlet pages need no pre-split section", () => {
  // Restaurant (Dinning Room) and Rannaghor have zero records of any kind
  // before the Sept 2025 outlet split - unlike Cafe, they should NOT show a
  // whole-cafe pre-split chart (that figure isn't attributable to one outlet).
  for (const route of ["/fnb/restaurant", "/fnb/rannaghor"]) {
    test(`${route}: no whole-cafe pre-split section`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText("Whole-Cafe", { exact: false })).toHaveCount(0);
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

  test("Store P&L: year selector switches to a real FY 22-23 total (Sienna workbook has full multi-year detail)", async ({ page }) => {
    const channels = await siennaChannelYearTotals("22"); // FY 2022-23 block
    const total = Object.values(channels).reduce((a: number, b) => a + b, 0);

    await page.goto("/store");
    await page.getByRole("button", { name: "FY 22-23", exact: true }).click();
    await expect(kpi(page, "HP Store Revenue (FY)")).toHaveText(L(channels["HP Store"]));
    await expect(kpi(page, "Total Store Revenue (FY)")).toHaveText(L(total));
  });

  test("Consignment: year selector switches to a real FY 23-24 total", async ({ page }) => {
    const total = await consignmentYearTotal("23"); // FY 2023-24 block

    await page.goto("/store/consignment");
    await page.getByRole("button", { name: "FY 23-24", exact: true }).click();
    await expect(kpi(page, "Consignment Sales (FY 23-24)")).toHaveText(`₹${L(total)}`);
  });
});

// CEPL P&L department sheets only have monthly line-item detail for FY
// 2025-26 (verified against the dataset: no other year has any
// department-sheet financial records) - only the workbook's Overview sheet
// has coarser annual F&B/Store totals for FY21-22..24-25, and craft
// departments have no fallback at all. Selecting an earlier year on these
// pages must show real annual totals or an explanatory "not available" note
// - never a fabricated or silently-wrong number. These particular checks
// don't compare against the Excel files, but still run against the same
// live app/dataset as the rest of this suite, so they stay under the same
// file-level hasSources() skip rather than duplicating server setup.
test.describe("Fiscal-year selector degrades honestly where CEPL monthly detail doesn't exist", () => {
  test("Overview: FY 22-23 shows real annual totals, not the FY25-26 monthly charts", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/");
    await expect(page.getByText("Monthly Revenue - F&B vs Store", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "FY 22-23", exact: true }).click();
    await expect(page.getByText("Monthly detail - FY 22-23", { exact: true })).toBeVisible();
    // the monthly chart from the FY25-26 view must be gone, not stale
    await expect(page.getByText("Monthly Revenue - F&B vs Store", { exact: false })).toHaveCount(0);
    // annual KPIs should still be real numbers, not blank/NaN
    await expect(kpi(page, "F&B Revenue (FY 22-23)")).not.toHaveText(/NaN|undefined|^$/);

    expect(errors).toEqual([]);
  });

  test("F&B P&L: FY 22-23 shows only the two annual totals", async ({ page }) => {
    await page.goto("/fnb");
    await page.getByRole("button", { name: "FY 22-23", exact: true }).click();
    await expect(page.getByText("Monthly detail - FY 22-23", { exact: true })).toBeVisible();
    await expect(kpi(page, "Annual F&B Revenue")).not.toHaveText(/NaN|undefined|^$/);
    // the view switcher (Revenue Mix / Margin Trends / …) only exists when monthly detail does
    await expect(page.getByRole("button", { name: "Revenue Mix", exact: true })).toHaveCount(0);
  });

  test("Cash Flow: FY 22-23 shows no numbers at all (craft departments have zero fallback data)", async ({ page }) => {
    await page.goto("/cashflow");
    await page.getByRole("button", { name: "FY 22-23", exact: true }).click();
    await expect(page.getByText("Group cash flow - FY 22-23", { exact: true })).toBeVisible();
    // must not silently show a partial (F&B+Store-only) total mislabeled as the group figure -
    // the KPI label itself, not just any mention of "money in" (the explanatory note below
    // uses that phrase in prose)
    await expect(page.getByText("Money In (FY", { exact: false })).toHaveCount(0);
  });

  test("Pottery: FY 22-23 shows no numbers at all (no Overview-sheet fallback for craft depts)", async ({ page }) => {
    await page.goto("/crafts/pottery");
    await page.getByRole("button", { name: "FY 22-23", exact: true }).click();
    await expect(page.getByText("Monthly detail - FY 22-23", { exact: true })).toBeVisible();
    await expect(page.getByText("Gross Margin", { exact: false })).toHaveCount(0);
  });

  test("switching back to FY 25-26 restores full detail on every page", async ({ page }) => {
    for (const [route, chartText] of [
      ["/", "Monthly Revenue - F&B vs Store"],
      ["/fnb", "Revenue Mix"],
      ["/crafts/pottery", "Gross Margin"],
    ] as const) {
      await page.goto(route);
      await page.getByRole("button", { name: "FY 22-23", exact: true }).click();
      await page.getByRole("button", { name: "FY 25-26", exact: true }).click();
      await expect(page.getByText(chartText, { exact: false }).first()).toBeVisible();
    }
  });
});

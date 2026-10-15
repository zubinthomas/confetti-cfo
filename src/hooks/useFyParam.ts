import { useSearchParams } from "react-router-dom";

/** Backs a page's FY selector with the ?fy= URL param instead of local
 *  useState, so a drill-down link that sets ?fy= lands on the right year
 *  and the page's own chip clicks update a shareable/bookmarkable URL.
 *  Falls back to `defaultFy` (or the last entry of `availableFys` if not
 *  given) exactly like the old `selectedFy ?? fys?.at(-1)` idiom did, when
 *  the URL has no ?fy= or it's not in this page's own available list (e.g.
 *  a stale/foreign FY key). `defaultFy` exists for pages whose own default
 *  isn't simply "the last available FY" - e.g. a page that chip-lists a
 *  synthetic targets year after its real years but still wants to land on
 *  the last real year by default. */
export function useFyParam(availableFys: string[] | undefined, defaultFy?: string): [string | undefined, (fy: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFy = searchParams.get("fy") ?? undefined;
  const fy = urlFy && availableFys?.includes(urlFy) ? urlFy : (defaultFy ?? availableFys?.at(-1));

  const setFy = (next: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("fy", next);
      return p;
    }, { replace: true }); // replace, not push - a FY chip click today creates no
                            // history entry, and push would make Back cycle through
                            // every chip click instead of leaving the page
  };

  return [fy, setFy];
}

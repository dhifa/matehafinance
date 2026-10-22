import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CONTENT_HEIGHT, CONTENT_WIDTH } from "./docTheme";
import { DocumentPage, baseTextStyle } from "./DocumentPrimitives";

/**
 * A piece of document flow. "row" units are item-table rows: a table header is
 * inserted above the first row on each page. "block" units are everything after
 * the table (totals, payment info, signatures...).
 */
export interface FlowUnit {
  key: string;
  kind: "row" | "block";
  node: React.ReactNode;
  // Never start a page with this unit alone: pull the previous unit along with it.
  keepWithPrevious?: boolean;
}

interface MeasuredHeights {
  firstHeader: number;
  continuationHeader: number;
  tableHeader: number;
  units: number[];
}

/**
 * Greedily packs units into pages using their measured heights, so nothing is
 * ever clipped or split across a page boundary.
 */
export function packPages(units: FlowUnit[], h: MeasuredHeights, available = CONTENT_HEIGHT): number[][] {
  interface Page { idx: number[]; used: number; rows: number }
  const cost = (page: Page, i: number) =>
    units[i].kind === "row" && page.rows === 0 ? h.units[i] + h.tableHeader : h.units[i];

  const pages: Page[] = [];
  let cur: Page = { idx: [], used: h.firstHeader, rows: 0 };

  const add = (page: Page, i: number) => {
    page.used += cost(page, i);
    page.idx.push(i);
    if (units[i].kind === "row") page.rows++;
  };

  for (let i = 0; i < units.length; i++) {
    if (cur.idx.length > 0 && cur.used + cost(cur, i) > available) {
      const carry: number[] = [];
      const last = cur.idx[cur.idx.length - 1];
      if (units[i].keepWithPrevious && cur.idx.length > 1) {
        cur.idx.pop();
        cur.used -= h.units[last];
        if (units[last].kind === "row") {
          cur.rows--;
          // The table header was charged with this row; give it back if the page has no rows left
          if (cur.rows === 0) cur.used -= h.tableHeader;
        }
        carry.push(last);
      }
      pages.push(cur);
      cur = { idx: [], used: h.continuationHeader, rows: 0 };
      carry.forEach((j) => add(cur, j));
    }
    add(cur, i);
  }
  pages.push(cur);
  return pages.map((p) => p.idx);
}

const FONT_PROBES = ["400 11px 'Inter Variable'", "italic 600 11px 'Inter Variable'", "800 11px 'Inter Variable'"];

let fontsPromise: Promise<void> | null = null;
export function loadDocumentFonts(): Promise<void> {
  if (!fontsPromise) {
    fontsPromise =
      typeof document !== "undefined" && document.fonts
        ? Promise.all(FONT_PROBES.map((f) => document.fonts.load(f).catch(() => [])))
            .then(() => document.fonts.ready)
            .then(() => undefined)
        : Promise.resolve();
  }
  return fontsPromise;
}

export interface PaginatedDocumentProps {
  firstHeader: React.ReactNode;
  continuationHeader: React.ReactNode;
  tableHeader: React.ReactNode;
  units: FlowUnit[];
  renderFooter: (pageNumber: number, totalPages: number) => React.ReactNode;
  // Changes whenever the document content changes, to trigger re-measuring.
  layoutKey: string;
  onPageCount?: (count: number) => void;
  onReady?: () => void;
}

export default function PaginatedDocument({
  firstHeader,
  continuationHeader,
  tableHeader,
  units,
  renderFooter,
  layoutKey,
  onPageCount,
  onReady,
}: PaginatedDocumentProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [pages, setPages] = useState<number[][] | null>(null);

  useEffect(() => {
    let alive = true;
    loadDocumentFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const height = (name: string) => (root.querySelector(`[data-measure="${name}"]`) as HTMLElement | null)?.offsetHeight ?? 0;
    const unitEls: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>("[data-measure-unit]"));
    setPages(
      packPages(units, {
        firstHeader: height("first"),
        continuationHeader: height("continuation"),
        tableHeader: height("table"),
        units: unitEls.map((el) => el.offsetHeight),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, fontsReady]);

  useEffect(() => {
    if (!pages) return;
    onPageCount?.(pages.length);
    if (fontsReady) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, fontsReady]);

  return (
    <>
      {/* Off-screen measuring copy, laid out at the exact content width */}
      <div style={{ position: "relative", height: 0, overflow: "hidden" }} aria-hidden>
        <div ref={measureRef} style={{ ...baseTextStyle, position: "absolute", top: 0, left: 0, width: CONTENT_WIDTH, visibility: "hidden" }}>
          <div data-measure="first">{firstHeader}</div>
          <div data-measure="continuation">{continuationHeader}</div>
          <div data-measure="table">{tableHeader}</div>
          {units.map((u) => (
            <div key={u.key} data-measure-unit>
              {u.node}
            </div>
          ))}
        </div>
      </div>

      {pages &&
        pages.map((idx, pageIndex) => (
          <React.Fragment key={pageIndex}>
          <DocumentPage footer={renderFooter(pageIndex + 1, pages.length)}>
            {pageIndex === 0 ? firstHeader : continuationHeader}
            {idx.map((i, pos) => {
              const unit = units[i];
              const startsTable = unit.kind === "row" && (pos === 0 || units[idx[pos - 1]].kind !== "row");
              return (
                <React.Fragment key={unit.key}>
                  {startsTable && tableHeader}
                  <div>{unit.node}</div>
                </React.Fragment>
              );
            })}
          </DocumentPage>
          </React.Fragment>
        ))}
    </>
  );
}

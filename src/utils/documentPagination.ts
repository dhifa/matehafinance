/**
 * Document Pagination Helper for Quotation, Invoice, and Kwitansi.
 * Ensures long tables and content split cleanly across multiple sheets (Sheet 1, Sheet 2, etc.)
 * so that signatures and summaries are NEVER sliced or cut between pages.
 */

export interface PageItem<T> {
  item: T;
  originalIndex: number;
}

export interface DocumentPage<T> {
  pageIndex: number;
  pageNumber: number;
  totalPages: number;
  items: PageItem<T>[];
  isFirstPage: boolean;
  isLastPage: boolean;
}

export interface PaginationResult<T> {
  isMultiPage: boolean;
  totalPages: number;
  pages: DocumentPage<T>[];
}

/**
 * Calculates estimated vertical weight of an item based on description lines
 */
export function getItemWeight(description?: string): number {
  if (!description) return 1.0;
  const lines = description.split('\n').filter(l => l.trim().length > 0).length;
  // Single-line item is 1.0; each extra line adds ~0.5 weight
  return 1.0 + Math.max(0, lines - 1) * 0.5;
}

/**
 * Paginates items for Quotation or Invoice.
 * 
 * Single Page capacity:
 * - Kop + Header + Metadata + Kepada Yth + Opening = ~400px
 * - Totals + Terbilang + Terms + Bank + Penutup + Signature = ~430px
 * - Remaining space for items = ~260px (approx 4.8 weight units)
 * 
 * If total item weight exceeds 4.8, split into Sheet 1 and Sheet 2 (or more).
 */
export function paginateDocumentItems<T extends { description: string }>(
  items: T[],
  extraTermsWeight: number = 0
): PaginationResult<T> {
  if (!items || items.length === 0) {
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          totalPages: 1,
          items: [],
          isFirstPage: true,
          isLastPage: true,
        },
      ],
    };
  }

  const weights = items.map(it => getItemWeight(it.description));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  // Single page capacity threshold
  // If terms are long, single page capacity is smaller
  const singlePageCapacity = Math.max(3.8, 4.8 - extraTermsWeight);

  if (totalWeight <= singlePageCapacity && items.length <= 4) {
    // Fits on 1 single sheet
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          totalPages: 1,
          items: items.map((item, originalIndex) => ({ item, originalIndex })),
          isFirstPage: true,
          isLastPage: true,
        },
      ],
    };
  }

  // Multi-page distribution
  // On Page 1 of multi-page (no summary/signature): capacity is ~8.5 weight units
  // On Page 2 (with summary & signature): capacity is ~6.5 - 7.5 weight units
  // If totalWeight <= 14, we split cleanly into exactly 2 sheets!
  if (totalWeight <= 14) {
    // Determine how many items go to Sheet 1 so both sheets look balanced.
    // Sheet 1 should take around 55%-65% of items, leaving at least 1-2 items for Sheet 2.
    let sheet1ItemsCount = 0;
    let accumulatedWeight = 0;
    const targetSheet1Weight = Math.min(8.5, Math.max(3.5, totalWeight * 0.58));

    for (let i = 0; i < items.length; i++) {
      const w = weights[i];
      // Keep at least 1 item for sheet 2
      if (i === items.length - 1 && sheet1ItemsCount > 0) {
        break;
      }
      if (accumulatedWeight + w > 8.5 && sheet1ItemsCount > 0) {
        break;
      }
      if (accumulatedWeight + w <= targetSheet1Weight || sheet1ItemsCount === 0) {
        sheet1ItemsCount++;
        accumulatedWeight += w;
      } else {
        // If adding next item exceeds target and we already have items, stop here
        break;
      }
    }

    const sheet1List = items.slice(0, sheet1ItemsCount).map((item, originalIndex) => ({
      item,
      originalIndex,
    }));
    const sheet2List = items.slice(sheet1ItemsCount).map((item, idx) => ({
      item,
      originalIndex: sheet1ItemsCount + idx,
    }));

    return {
      isMultiPage: true,
      totalPages: 2,
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          totalPages: 2,
          items: sheet1List,
          isFirstPage: true,
          isLastPage: false,
        },
        {
          pageIndex: 1,
          pageNumber: 2,
          totalPages: 2,
          items: sheet2List,
          isFirstPage: false,
          isLastPage: true,
        },
      ],
    };
  }

  // If more than 14 weight units (3 or more sheets)
  const pages: DocumentPage<T>[] = [];
  let currentIndex = 0;

  while (currentIndex < items.length) {
    const isFirst = pages.length === 0;
    // Page 1 capacity ~8.5; Middle pages ~10.0; Last page with signature ~6.5
    const remainingItems = items.slice(currentIndex);
    const remainingWeight = remainingItems.map(it => getItemWeight(it.description)).reduce((a, b) => a + b, 0);

    let capacity = isFirst ? 8.5 : 9.5;
    // If remaining weight is small enough to be the last page
    if (remainingWeight <= 7.0 && !isFirst) {
      capacity = 7.0;
    }

    const pageItems: PageItem<T>[] = [];
    let curWeight = 0;

    while (currentIndex < items.length) {
      const it = items[currentIndex];
      const w = getItemWeight(it.description);
      if (pageItems.length > 0 && curWeight + w > capacity) {
        break;
      }
      pageItems.push({ item: it, originalIndex: currentIndex });
      curWeight += w;
      currentIndex++;
    }

    pages.push({
      pageIndex: pages.length,
      pageNumber: pages.length + 1,
      totalPages: 0, // will fill below
      items: pageItems,
      isFirstPage: isFirst,
      isLastPage: false, // will update below
    });
  }

  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    p.totalPages = totalPages;
    p.isLastPage = idx === totalPages - 1;
  });

  return {
    isMultiPage: totalPages > 1,
    totalPages,
    pages,
  };
}

import React from "react";
import { InvoiceItem, formatRupiah } from "../../types";
import { formatQty, formatTime, mainAmount, subItemAmount } from "../../utils/lineItems";
import { ItemRow } from "./DocumentPrimitives";
import { FlowUnit } from "./PaginatedDocument";

/**
 * Table rows for invoice/quotation items: each item, then its detail lines
 * ("poin"). A detail line shows a price and amount only when it is an add-cost.
 */
export function itemRowUnits(items: InvoiceItem[], showTime: boolean): FlowUnit[] {
  return items.flatMap((item, i) => {
    const hasDetails = (item.subItems?.length ?? 0) > 0;
    const units: FlowUnit[] = [
      {
        key: `row-${i}`,
        kind: "row",
        node: (
          <ItemRow
            index={i}
            number={i + 1}
            description={item.description}
            qty={formatQty(item.qty, item.unit)}
            time={formatTime(item.days, item.timeUnit)}
            showTime={showTime}
            price={item.price > 0 ? formatRupiah(item.price) : ""}
            total={formatRupiah(hasDetails ? mainAmount(item) : item.total)}
          />
        ),
      },
    ];
    (item.subItems || []).forEach((sub, j) => {
      const cost = subItemAmount(sub);
      units.push({
        key: `row-${i}-${j}`,
        kind: "row",
        keepWithPrevious: j === 0,
        node: (
          <ItemRow
            index={i}
            description={sub.description}
            qty={formatQty(sub.qty, sub.unit)}
            showTime={showTime}
            price={cost ? formatRupiah(Number(sub.price)) : ""}
            total={cost ? formatRupiah(cost) : ""}
            isDetail
          />
        ),
      });
    });
    return units;
  });
}

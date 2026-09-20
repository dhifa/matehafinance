import { saveAs } from "file-saver";
import { Invoice } from "../types";
import { generateInvoicePdfBlob } from "./pdfGenerator";

export const bulkExport = async (selectedInvoices: string[], allInvoices: Invoice[]) => {
    for (const id of selectedInvoices) {
        const inv = allInvoices.find(i => i.id === id);
        if (inv) {
            const pdfBlob = await generateInvoicePdfBlob(inv);
            saveAs(pdfBlob, `Invoice_${inv.invoiceNumber}.pdf`);
        }
    }
};

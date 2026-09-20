import React from "react";
import { formatRupiah, PublishedPayslip } from "../types";

const INDONESIAN_MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

interface PublicPayslipViewProps {
  payslip: PublishedPayslip;
}

export default function PublicPayslipView({ payslip }: PublicPayslipViewProps) {
  const totalEarnings = payslip.customEarnings.reduce((acc, val) => acc + val.amount, 0);
  const totalDeductions = payslip.customDeductions.reduce((acc, val) => acc + val.amount, 0);
  const takeHomePay = totalEarnings - totalDeductions;

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-slate-200">
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-6 font-sans">SLIP GAJI</h1>
        
        <div className="mb-6 border-b pb-4">
          <p className="text-sm font-semibold">Nama: <span className="font-normal">{payslip.staffDisplayName}</span></p>
          <p className="text-sm font-semibold">Jabatan: <span className="font-normal">{payslip.staffJob}</span></p>
          <p className="text-sm font-semibold">Periode: <span className="font-normal">{INDONESIAN_MONTH_NAMES[payslip.month]} {payslip.year}</span></p>
        </div>

        <table className="w-full mb-6">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left p-2 border-b">Deskripsi</th>
              <th className="text-right p-2 border-b">Nominal (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {payslip.customEarnings.map((item) => (
              <tr key={item.id}>
                <td className="p-2 border-b">{item.description}</td>
                <td className="p-2 border-b text-right font-mono">{formatRupiah(item.amount)}</td>
              </tr>
            ))}
            {payslip.customDeductions.map((item) => (
              <tr key={item.id} className="text-rose-700">
                <td className="p-2 border-b">{item.description}</td>
                <td className="p-2 border-b text-right font-mono">(- {formatRupiah(item.amount)})</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between font-bold text-lg bg-slate-100 p-4 rounded-md mb-6">
          <span>Take Home Pay</span>
          <span className="font-mono">{formatRupiah(takeHomePay)}</span>
        </div>

        {payslip.eventSummary && payslip.eventSummary.length > 0 && (
          <div>
            <h4 className="text-sm font-bold mb-2">Event Summary</h4>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-2 border-b">Nama Event</th>
                  <th className="p-2 border-b">Waktu</th>
                  <th className="p-2 border-b">Hari</th>
                </tr>
              </thead>
              <tbody>
                {payslip.eventSummary.map((event, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border-b">{event.name}</td>
                    <td className="p-2 border-b">{event.date} - {event.location}</td>
                    <td className="p-2 border-b text-center">{event.daysCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

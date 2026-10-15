import { useState } from "react";
import { Loader2 } from "lucide-react";
import { exportCsv, exportExcel, type ExportSheet } from "@/lib/dataExport";

// Drop into a page's header/toolbar row next to its FY chips. CSV is
// synchronous and gets no loading state, matching the existing "Download
// Slip" convention (employeeDocs.ts). Excel goes through exceljs
// asynchronously, so it gets the "Download ID Card" convention instead:
// disabled + a spinner while generating.
export default function ExportButtons({ filenameBase, sheets }: { filenameBase: string; sheets: ExportSheet[] }) {
  const [generating, setGenerating] = useState(false);

  const downloadExcel = async () => {
    setGenerating(true);
    try {
      await exportExcel(filenameBase, sheets);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Export:</span>
      <button onClick={() => exportCsv(filenameBase, sheets)} className="text-primary hover:underline">
        CSV
      </button>
      <span className="text-muted-foreground">/</span>
      <button onClick={downloadExcel} disabled={generating} className="text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1">
        {generating && <Loader2 className="w-3 h-3 animate-spin" />}
        Excel
      </button>
    </div>
  );
}

import React, { useState } from "react";
import { ImportResult, CRM_FIELDS } from "../lib/types";
import { DataTable } from "./DataTable";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import Papa from "papaparse";

interface ResultStepProps {
  result: ImportResult;
  onReset: () => void;
}

export function ResultStep({ result, onReset }: ResultStepProps) {
  const [activeTab, setActiveTab] = useState<"parsed" | "skipped">("parsed");
  
  const handleDownload = () => {
    // Generate CSV string from result.records
    const csv = Papa.unparse(result.records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "imported_leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
            <span className="font-bold text-lg">{result.summary.totalRows}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Rows</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">Processed</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Success</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{result.summary.successCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Skipped</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{result.summary.skippedCount}</p>
          </div>
        </div>
      </div>

      {/* Tables Section */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 gap-4 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex bg-gray-200/50 dark:bg-gray-800/50 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("parsed")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "parsed" 
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Parsed ({result.summary.successCount})
            </button>
            <button
              onClick={() => setActiveTab("skipped")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "skipped" 
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Skipped ({result.summary.skippedCount})
            </button>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {activeTab === "parsed" && result.records.length > 0 && (
              <button
                onClick={handleDownload}
                className="text-sm px-4 py-2 text-blue-600 dark:text-blue-400 hover:underline font-medium flex-1 sm:flex-none text-center"
              >
                Download CSV
              </button>
            )}
            <button
              onClick={onReset}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Import Another
            </button>
          </div>
        </div>
        
        <div className="p-4">
          {activeTab === "parsed" ? (
            <DataTable 
              columns={[...CRM_FIELDS]} 
              data={result.records} 
              maxRows={100}
            />
          ) : (
            <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-sm text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_#e5e7eb] dark:shadow-[0_1px_0_0_#1f2937]">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-24">Row #</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-64">Reason</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Raw Data (Snapshot)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-950">
                  {result.skipped.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500 italic">
                        No rows were skipped!
                      </td>
                    </tr>
                  ) : (
                    result.skipped.map((s, i) => (
                      <tr key={i} className="hover:bg-red-50/50 dark:hover:bg-red-900/10">
                        <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-400">{s.rowIndex}</td>
                        <td className="px-4 py-3 text-red-600 dark:text-red-400 max-w-[250px] truncate" title={s.reason}>
                          {s.reason}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs max-w-xl truncate" title={JSON.stringify(s.originalData)}>
                          {JSON.stringify(s.originalData)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

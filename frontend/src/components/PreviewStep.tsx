import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import { DataTable } from "./DataTable";
import { Play, FileText } from "lucide-react";

interface PreviewStepProps {
  file: File;
  onConfirm: (rows: Record<string, string>[], cols: string[]) => void;
  onCancel: () => void;
}

export function PreviewStep({ file, onConfirm, onCancel }: PreviewStepProps) {
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      preview: 100, // Limit to 100 rows to prevent OOM crashes on large files
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn("PapaParse errors:", results.errors);
        }
        
        if (results.meta.fields) {
          setColumns(results.meta.fields);
        }
        setData(results.data);
        setLoading(false);
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      }
    });
  }, [file]);

  if (loading) {
    return <div className="text-center py-12 text-gray-500 animate-pulse">Parsing CSV...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={onCancel} className="text-blue-500 hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/50 dark:bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-gray-200/50 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-inner">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Preview Data
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Previewing first <span className="font-semibold text-gray-700 dark:text-gray-300">{data.length} rows</span> and <span className="font-semibold text-gray-700 dark:text-gray-300">{columns.length} columns</span> in {file.name}.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={onCancel}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-full font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(data, columns)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-2.5 rounded-full font-medium text-white bg-gray-900 hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 shadow-md hover:shadow-lg transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            Start Import
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white/50 dark:bg-white/5 backdrop-blur-md border border-gray-200/50 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
        <DataTable columns={columns} data={data} maxRows={100} />
      </div>
    </div>
  );
}

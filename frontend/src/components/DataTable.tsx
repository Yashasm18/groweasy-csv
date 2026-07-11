import React from "react";

export interface DataTableProps {
  columns: string[];
  data: Record<string, any>[];
  keyField?: string; // which column to use as unique key if available
  maxRows?: number;
}

export function DataTable({ columns, data, keyField, maxRows }: DataTableProps) {
  const displayData = maxRows ? data.slice(0, maxRows) : data;

  if (columns.length === 0) {
    return <div className="text-gray-500 italic p-4 border rounded">No data to display.</div>;
  }

  return (
    <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm">
      <table className="min-w-full text-sm text-left whitespace-nowrap">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_#e5e7eb] dark:shadow-[0_1px_0_0_#1f2937]">
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {displayData.map((row, i) => (
            <tr
              key={keyField ? row[keyField] || i : i}
              className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
            >
              {columns.map((col, j) => (
                <td
                  key={j}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-400 max-w-xs truncate"
                  title={row[col] ? String(row[col]) : ""}
                >
                  {row[col] !== undefined && row[col] !== null ? String(row[col]) : (
                    <span className="text-gray-300 dark:text-gray-600 italic">empty</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          {maxRows && data.length > maxRows && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-3 text-center text-gray-500 italic bg-gray-50 dark:bg-gray-900/50"
              >
                Showing first {maxRows} of {data.length} rows...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

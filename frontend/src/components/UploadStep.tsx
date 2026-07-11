import React, { useCallback, useRef, useState } from "react";
import { UploadCloud, FileType, AlertCircle } from "lucide-react";

interface UploadStepProps {
  onFileSelect: (file: File) => void;
}

export function UploadStep({ onFileSelect }: UploadStepProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = (file: File) => {
    setError(null);
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Please select a valid CSV file.");
      return;
    }
    if (file.size === 0) {
      setError("This file appears to be empty.");
      return;
    }
    onFileSelect(file);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center h-full">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Upload Your CSV File</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">We'll automatically extract and map the leads into your CRM structure.</p>
      </div>

      <div
        className={`w-full relative rounded-3xl border-2 border-dashed p-14 transition-all duration-300 ease-out flex flex-col items-center justify-center text-center
          ${dragActive 
            ? "border-gray-900 bg-gray-50/50 dark:border-white dark:bg-white/5" 
            : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-transparent"
          }
          `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className={`p-4 rounded-full mb-6 transition-colors duration-300 ${dragActive ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
          <UploadCloud className="w-8 h-8" strokeWidth={1.5} />
        </div>
        
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Drop File Here
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm text-sm">
          Drag & drop your CSV file or browse to upload (Max 25MB)
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleChange}
          className="hidden"
        />

        <button
          onClick={() => inputRef.current?.click()}
          className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 dark:border-gray-700 dark:bg-black/50 dark:hover:bg-black dark:text-white px-8 py-3 rounded-full font-medium transition-all shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-800 flex items-center gap-2"
        >
          Browse Files
        </button>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/30 w-full animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}

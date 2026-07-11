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
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
      <div
        className={`w-full relative rounded-2xl border-2 border-dashed p-12 transition-all duration-300 ease-in-out flex flex-col items-center justify-center text-center
          ${dragActive 
            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" 
            : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-white/50 dark:bg-gray-900/50"
          }
          backdrop-blur-sm shadow-sm`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/50 mb-4 shadow-inner">
          <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Drag & Drop your CSV
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
          We'll automatically extract the leads and map them into your CRM structure using AI.
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
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-full font-medium transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950 flex items-center gap-2"
        >
          <FileType className="w-4 h-4" />
          Browse Files
        </button>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-100 dark:border-red-900/50 w-full animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}

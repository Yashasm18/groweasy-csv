"use client";

import React, { useState } from "react";
import { UploadStep } from "@/components/UploadStep";
import { PreviewStep } from "@/components/PreviewStep";
import { LoadingStep } from "@/components/LoadingStep";
import { ResultStep } from "@/components/ResultStep";
import { AppState, ImportResult } from "@/lib/types";
import { importCsv, ApiError } from "@/lib/api";
import { AlertCircle } from "lucide-react";

export default function Home() {
  const [state, setState] = useState<AppState>({
    step: "upload",
    file: null,
    previewRows: [],
    previewCols: [],
    result: null,
    error: null,
    progress: null,
  });

  const handleFileSelect = (file: File) => {
    setState((s) => ({ ...s, step: "preview", file, error: null }));
  };

  const handleCancelPreview = () => {
    setState((s) => ({ ...s, step: "upload", file: null, previewRows: [], previewCols: [] }));
  };

  const handleConfirmImport = async (rows: Record<string, string>[], cols: string[]) => {
    if (!state.file) return;
    
    setState((s) => ({ ...s, step: "loading", previewRows: rows, previewCols: cols, error: null }));
    
    try {
      const result = await importCsv(state.file);
      setState((s) => ({ ...s, step: "result", result }));
    } catch (error) {
      setState((s) => ({
        ...s,
        step: "error",
        error: error instanceof ApiError ? error.message : "An unexpected error occurred.",
      }));
    }
  };

  const handleReset = () => {
    setState({
      step: "upload",
      file: null,
      previewRows: [],
      previewCols: [],
      result: null,
      error: null,
      progress: null,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 tracking-tight mb-3">
            GrowEasy CSV Importer
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            Upload your messy leads, and our AI will automatically structure, map, and validate them into your CRM format.
          </p>
        </div>

        {/* Stepper UI */}
        <div className="w-full max-w-3xl mx-auto mb-10 hidden sm:block">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-gray-200 dark:bg-gray-800 -z-10"></div>
            {["Upload", "Preview", "Importing", "Results"].map((label, idx) => {
              // map state.step to an index 0-3
              const stepMap: Record<string, number> = { upload: 0, preview: 1, loading: 2, result: 3, error: 2 };
              const currentStepIdx = stepMap[state.step];
              
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const isError = state.step === "error" && idx === 2;

              return (
                <div key={label} className="flex flex-col items-center bg-gray-50 dark:bg-gray-950 px-4">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold mb-2 transition-colors
                      ${isPast ? "bg-blue-600 text-white" : ""}
                      ${isCurrent && !isError ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40" : ""}
                      ${isError ? "bg-red-600 text-white ring-4 ring-red-100 dark:ring-red-900/40" : ""}
                      ${!isPast && !isCurrent ? "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400" : ""}
                    `}
                  >
                    {isPast ? "✓" : idx + 1}
                  </div>
                  <span className={`text-xs font-medium ${isCurrent || isPast ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-600"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Step Component rendering */}
        <div className="w-full">
          {state.step === "upload" && (
            <UploadStep onFileSelect={handleFileSelect} />
          )}

          {state.step === "preview" && state.file && (
            <PreviewStep
              file={state.file}
              onConfirm={handleConfirmImport}
              onCancel={handleCancelPreview}
            />
          )}

          {state.step === "loading" && (
            <LoadingStep />
          )}

          {state.step === "result" && state.result && (
            <ResultStep result={state.result} onReset={handleReset} />
          )}

          {state.step === "error" && (
            <div className="max-w-md mx-auto p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/50 text-center animate-in zoom-in-95">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Import Failed</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">{state.error}</p>
              <button
                onClick={handleReset}
                className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-full font-medium shadow-sm hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

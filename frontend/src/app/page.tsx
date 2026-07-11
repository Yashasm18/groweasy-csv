"use client";

import React, { useState, useEffect } from "react";
import { UploadStep } from "@/components/UploadStep";
import { PreviewStep } from "@/components/PreviewStep";
import { LoadingStep } from "@/components/LoadingStep";
import { ResultStep } from "@/components/ResultStep";
import { AppState, ImportResult } from "@/lib/types";
import { importCsv, ApiError } from "@/lib/api";
import { AlertCircle, Moon, Sun } from "lucide-react";

export default function Home() {
  const [state, setState] = useState<AppState & { jobId?: string }>({
    step: "upload",
    file: null,
    previewRows: [],
    previewCols: [],
    result: null,
    error: null,
    progress: null,
  });

  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check initial system preference or saved theme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleFileSelect = (file: File) => {
    setState((s) => ({ ...s, step: "preview", file, error: null }));
  };

  const handleCancelPreview = () => {
    setState((s) => ({ ...s, step: "upload", file: null, previewRows: [], previewCols: [], jobId: undefined }));
  };

  const handleConfirmImport = async (rows: Record<string, string>[], cols: string[]) => {
    if (!state.file) return;
    
    // Generate unique job ID for SSE
    const newJobId = crypto.randomUUID();

    setState((s) => ({ ...s, step: "loading", previewRows: rows, previewCols: cols, error: null, jobId: newJobId }));
    
    try {
      const result = await importCsv(state.file, newJobId);
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
      jobId: undefined,
    });
  };

  const stepMap: Record<string, number> = { upload: 0, preview: 1, loading: 2, result: 3, error: 2 };
  const currentStepIdx = stepMap[state.step];
  const steps = ["1. Select File", "2. Map Columns", "3. Validate Data", "4. Import"];

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0a0a0a] transition-colors duration-300 relative overflow-hidden flex flex-col">
      {/* Background Subtle Mesh (Monochrome Silver) */}
      <div className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} 
      />

      {/* Top Navbar */}
      <nav className="relative z-10 w-full px-8 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center">
            <span className="text-white dark:text-gray-900 font-bold text-lg leading-none">G</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
            GrowEasy <span className="font-normal text-gray-500 dark:text-gray-400">CSV Importer</span>
          </h1>
        </div>
        <div className="flex items-center space-x-6">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-gray-300"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className="hidden sm:flex items-center space-x-6 text-sm font-medium text-gray-600 dark:text-gray-400">
            <a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Dashboard</a>
            <a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">History</a>
            <a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Support</a>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12 flex flex-col md:flex-row gap-8 relative z-10">
        
        {/* Left Sidebar: Progress Tracker */}
        <div className="md:w-64 flex-shrink-0">
          <div className="sticky top-12">
            <div className="flex flex-col space-y-8">
              {steps.map((label, idx) => {
                const isPast = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const isError = state.step === "error" && idx === 2;

                return (
                  <div key={label} className="flex items-center relative group">
                    {/* Connecting line */}
                    {idx < steps.length - 1 && (
                      <div className={`absolute left-[15px] top-[30px] bottom-[-32px] w-0.5 -z-10 transition-colors duration-300
                        ${isPast ? "bg-gray-900 dark:bg-gray-100" : "bg-gray-200 dark:bg-gray-800"}
                      `} />
                    )}
                    
                    <div className="flex items-center justify-center w-8 h-8 shrink-0 mr-4">
                      <div 
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300
                          ${isPast ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : ""}
                          ${isCurrent && !isError ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-lg scale-110" : ""}
                          ${isError ? "bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110" : ""}
                          ${!isPast && !isCurrent ? "bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 text-gray-400" : ""}
                        `}
                      >
                        {isPast ? "✓" : idx + 1}
                      </div>
                    </div>
                    <span className={`text-sm font-medium transition-colors duration-300
                      ${isCurrent ? "text-gray-900 dark:text-gray-100 translate-x-1" : ""}
                      ${isPast ? "text-gray-600 dark:text-gray-400" : ""}
                      ${!isCurrent && !isPast ? "text-gray-400 dark:text-gray-600" : ""}
                    `}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* Context Info Box */}
            <div className="mt-16 p-4 rounded-xl bg-white/40 dark:bg-black/20 border border-white/50 dark:border-white/10 backdrop-blur-md">
              <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2">Import Limits</h4>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                <li>Max file size: 50MB</li>
                <li>Max rows: 20,000</li>
                <li>Format: .csv (UTF-8)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Content Area: Glassmorphism Card */}
        <div className="flex-1 w-full min-w-0">
          <div className="w-full bg-white/60 dark:bg-[#111111]/70 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] rounded-3xl p-6 sm:p-10 transition-all duration-300 h-full min-h-[500px] flex flex-col relative overflow-hidden">
            
            {/* Inner subtle glow for glass effect */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent"></div>
            
            {/* Dynamic Step Component rendering */}
            <div className="flex-1 w-full h-full flex flex-col">
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
                <LoadingStep jobId={state.jobId} />
              )}

              {state.step === "result" && state.result && (
                <ResultStep result={state.result} onReset={handleReset} />
              )}

              {state.step === "error" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                  <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center mb-6">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">Import Failed</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">{state.error}</p>
                  <button
                    onClick={handleReset}
                    className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-3 rounded-full font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all active:scale-95"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

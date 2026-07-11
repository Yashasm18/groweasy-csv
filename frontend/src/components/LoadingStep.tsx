import React, { useEffect, useState } from "react";
import { Loader2, Sparkles, Database, CheckCircle2 } from "lucide-react";

export function LoadingStep() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Simple mock staged loader since we don't have SSE yet (Phase 4)
    // We just cycle through some states to give the user a sense of progress
    const timers = [
      setTimeout(() => setStage(1), 2000), // Mapping fields...
      setTimeout(() => setStage(2), 6000), // Validating AI outputs...
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const stages = [
    { label: "Parsing CSV and chunking rows...", icon: Database },
    { label: "AI is mapping fields into CRM schema...", icon: Sparkles },
    { label: "Applying deterministic validation rules...", icon: CheckCircle2 },
  ];

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm animate-in zoom-in-95">
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full blur-xl bg-blue-500/20 animate-pulse"></div>
        <div className="p-5 bg-blue-50 dark:bg-blue-900/30 rounded-full relative shadow-inner">
          <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Processing Import
      </h3>

      <div className="w-full flex flex-col gap-4">
        {stages.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx === stage;
          const isDone = idx < stage;
          const isPending = idx > stage;

          return (
            <div 
              key={idx} 
              className={`flex items-center gap-4 transition-all duration-500 ${
                isPending ? "opacity-30 scale-95" : isActive ? "opacity-100 scale-100" : "opacity-70 scale-100"
              }`}
            >
              <div className={`p-2 rounded-full transition-colors ${
                isDone 
                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" 
                  : isActive 
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" 
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800"
              }`}>
                {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={`text-sm font-medium ${
                isActive ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
              }`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      
      <p className="mt-8 text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs">
        This can take up to a minute depending on the file size. Waking up the server may add a slight delay.
      </p>
    </div>
  );
}

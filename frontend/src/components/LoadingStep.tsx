import React, { useEffect, useState } from "react";
import { Loader2, Database, Sparkles, CheckCircle2 } from "lucide-react";

interface LoadingStepProps {
  jobId?: string;
  onError?: (err: string) => void;
}

export function LoadingStep({ jobId, onError }: LoadingStepProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!jobId) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
    const es = new EventSource(`${API_BASE}/api/import/stream?jobId=${jobId}`);

    es.onmessage = (event) => {
      try {
        if (event.data === "connected") return;
        const data = JSON.parse(event.data);
        if (data.done === true && data.total === undefined) {
          setProgress(100);
          setStage(2);
          es.close();
          return;
        }

        let currentProgress = Math.round((data.done / data.total) * 100);
        
        // Clamp to 99% while streaming to avoid premature 100% jumping
        if (currentProgress >= 100) {
           currentProgress = 99;
        }
        
        setProgress(currentProgress);

        if (currentProgress < 100 && currentProgress > 0) {
          setStage(1);
        } else if (currentProgress === 100) {
          setStage(2);
        }
      } catch (err) {}
    };

    es.onerror = (err) => {
      es.close();
      if (onError) {
        onError("Lost connection to the server during processing. The import may have failed.");
      }
    };

    return () => es.close();
  }, [jobId, onError]);

  const stages = [
    { label: "Parsing CSV and chunking rows...", icon: Database },
    { label: "AI is mapping fields into CRM schema...", icon: Sparkles },
    { label: "Applying deterministic validation rules...", icon: CheckCircle2 },
  ];

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center h-full p-8">
      <div className="w-full flex flex-col items-center justify-center p-12 bg-white/40 dark:bg-black/20 backdrop-blur-md rounded-3xl border border-gray-200/50 dark:border-white/10 shadow-sm animate-in zoom-in-95">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full blur-xl bg-gray-400/20 dark:bg-white/10 animate-pulse"></div>
          <div className="p-5 bg-gray-100 dark:bg-gray-800 rounded-full relative shadow-inner">
            <Loader2 className="w-10 h-10 text-gray-900 dark:text-white animate-spin" />
          </div>
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Processing Import
        </h3>
        
        <div className="w-full mb-8 mt-2">
          <div className="flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-gray-900 dark:bg-white h-2.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

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
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm" 
                    : isActive 
                      ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 shadow-sm" 
                      : "bg-gray-100 text-gray-400 dark:bg-gray-800/50"
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
    </div>
  );
}

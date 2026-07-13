import React, { useState } from "react";
import { invokeLLM } from "@/api/integrations";
import { buildCFOContext } from "@/data/aiContext";
import { TrendingUp, Truck, BarChart3, CalendarDays, AlertTriangle, Tag, Building2, UtensilsCrossed, RefreshCw, Search, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface CannedQuery {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

const queries: CannedQuery[] = [
  { icon: TrendingUp, label: "Biggest FY 25-26 cost lines", prompt: "What are the biggest cost lines this year across the group, and where should we focus cost control?" },
  { icon: BarChart3, label: "Compare net margin by division", prompt: "Compare net margin across F&B, Store, Pottery, Batik, Stitching and Trading Items — which divisions drag the group down?" },
  { icon: CalendarDays, label: "Seasonality & weak months", prompt: "Which months were loss-making or weak this year, and what does the seasonality pattern suggest for planning next year?" },
  { icon: AlertTriangle, label: "Loss-making divisions", prompt: "Which divisions lost money this year, how much, and what would it take to turn them around?" },
  { icon: UtensilsCrossed, label: "F&B outlet performance", prompt: "Compare the F&B outlets (Bosar Ghor cafe, Dinning Room restaurant, Rannaghor events kitchen) — which is strongest and where is the opportunity?" },
  { icon: Tag, label: "Store category & channel mix", prompt: "Analyse the store's sales by category and channel — where is growth coming from and what looks over-concentrated?" },
  { icon: Truck, label: "Consignment partner review", prompt: "Review the consignment partner sales — which partners matter, and is the commission mix healthy?" },
  { icon: Building2, label: "F&B turnaround story", prompt: "Explain the F&B division's year-over-year turnaround — what changed vs FY 24-25 and is it sustainable?" },
  { icon: RefreshCw, label: "Events & Durga Puja impact", prompt: "How important are events (including Durga Puja) to F&B revenue, and should we invest more in them?" },
  { icon: Search, label: "What data are we missing?", prompt: "As CFO, what financial data are we not capturing yet, and what decisions does that limit?" },
];

export default function AIQueriesTab() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [activeQuery, setActiveQuery] = useState(null);

  const handleQuery = async (query: CannedQuery) => {
    setLoading(true);
    setActiveQuery(query.label);
    setResponse(null);
    const contextPrompt = `${buildCFOContext()}\n\nQuestion: ${query.prompt}`;
    const result = await invokeLLM(contextPrompt);
    setResponse(result);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-1">
          AI Query Layer — Click to Ask
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Tap a prompt to get AI-powered financial analysis
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {queries.map((q) => {
          const Icon = q.icon;
          const isActive = activeQuery === q.label && loading;
          return (
            <button
              key={q.label}
              onClick={() => handleQuery(q)}
              disabled={loading}
              className={`flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all duration-200
                ${isActive
                  ? "bg-primary/5 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5"
                }
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-sm">{q.label}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Analyzing: {activeQuery}...</span>
        </div>
      )}

      {response && !loading && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{activeQuery}</h3>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <ReactMarkdown>{response}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState } from "react";
import { invokeLLM } from "@/api/integrations";
import { TrendingUp, Truck, BarChart3, CalendarDays, AlertTriangle, Tag, Building2, UtensilsCrossed, RefreshCw, Search, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

const queries = [
  { icon: TrendingUp, label: "Top 10 expense increases this month", prompt: "Show me the top 10 expense increases this month across all divisions" },
  { icon: Truck, label: "Vendors with >10% cost increase", prompt: "Which vendors have had cost increases of more than 10% in the last 3 months?" },
  { icon: BarChart3, label: "Compare EBITDA across divisions", prompt: "Compare EBITDA by division for this month vs last month" },
  { icon: CalendarDays, label: "Predict cash flow — next 90 days", prompt: "Predict cash flow for the next 90 days based on current receivables, payables and revenue trends" },
  { icon: AlertTriangle, label: "Which department exceeded budget?", prompt: "Which department exceeded budget this month and by how much?" },
  { icon: Tag, label: "Highest margin SKUs by division", prompt: "Which SKUs generated the highest margin this quarter — show by division" },
  { icon: Building2, label: "Which unit needs working capital?", prompt: "Which business unit needs working capital injection and how much?" },
  { icon: UtensilsCrossed, label: "Siena menu items to reprice", prompt: "Show me Siena menu items that should be repriced — which have margins below 60%?" },
  { icon: RefreshCw, label: "Ceramics cash conversion cycle", prompt: "What is the ceramics division cash conversion cycle and how can it be improved?" },
  { icon: Search, label: "Detect cost anomalies this month", prompt: "Identify any cost anomalies or unusual spikes across utilities, payroll, or procurement this month" },
];

export default function AIQueriesTab() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [activeQuery, setActiveQuery] = useState(null);

  const handleQuery = async (query) => {
    setLoading(true);
    setActiveQuery(query.label);
    setResponse(null);
    const contextPrompt = `You are a CFO AI assistant for Confetti Exports, a group with 3 divisions: Ceramics (manufacturing, revenue ₹18.4L MTD, 47% gross margin), Textiles (lifestyle, revenue ₹14.2L MTD, 52% gross margin, ₹2.8L dead stock), and Siena (café/restaurant/bar, revenue ₹10.0L MTD, food cost 30%, wastage 4.2%). Group total revenue is ₹42.6L MTD, EBITDA 16.7%, cash ₹11.4L, receivables ₹24.8L (38 days), payables ₹16.2L (22 days), payroll ₹8.4L (19.7% of revenue). Inventory ₹31.5L. GST liability ₹3.2L.\n\nAnswer the following question with specific numbers, actionable insights, and recommendations. Format with markdown headings and bullet points.\n\nQuestion: ${query.prompt}`;
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
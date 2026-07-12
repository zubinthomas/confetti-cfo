import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Factory, Shirt, UtensilsCrossed,
  Banknote, MenuIcon, Sparkles, ShieldCheck, LogOut, Users, Store, Package
} from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import OverviewTab     from "@/components/dashboard/OverviewTab";
import CeramicsTab     from "@/components/dashboard/CeramicsTab";
import TextilesTab     from "@/components/dashboard/TextilesTab";
import TradingItemsTab from "@/components/dashboard/TradingItemsTab";
import SienaTab         from "@/components/dashboard/SienaTab";
import StoreTab         from "@/components/dashboard/StoreTab";
import CashFlowTab      from "@/components/dashboard/CashFlowTab";
import AIQueriesTab     from "@/components/dashboard/AIQueriesTab";

const tabs = [
  { id: "overview",  label: "Overview",       icon: LayoutDashboard },
  { id: "siena",     label: "F&B",            icon: UtensilsCrossed },
  { id: "store",     label: "Store",          icon: Store },
  { id: "ceramics",  label: "Ceramics",       icon: Factory },
  { id: "textiles",  label: "Textiles",       icon: Shirt },
  { id: "trading",   label: "Trading Items",  icon: Package },
  { id: "cashflow",  label: "Cash Flow",      icon: Banknote },
  { id: "ai",        label: "AI Queries",     icon: Sparkles },
];

const tabContent = {
  overview:  OverviewTab,
  siena:     SienaTab,
  store:     StoreTab,
  ceramics:  CeramicsTab,
  textiles:  TextilesTab,
  trading:   TradingItemsTab,
  cashflow:  CashFlowTab,
  ai:        AIQueriesTab,
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const ActiveComponent = tabContent[activeTab];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="mr-auto px-4 sm:px-6 py-4 flex items-center">
          <MenuIcon />
        </div>
        <div className="max-w-7xl w-full mr-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground tracking-tight">
              Confetti Exports
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              CFO Dashboard · FY 2025-26
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/hr"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted"
            >
              <Users className="w-3.5 h-3.5" /> HR Module
            </Link>
            <Link
              to="/compliance"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Compliance
            </Link>
            <button
              onClick={() => base44.auth.logout("/")}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tab Bar */}
        <div className="flex gap-1.5 flex-wrap mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ActiveComponent />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

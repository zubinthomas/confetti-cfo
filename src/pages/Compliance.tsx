import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import SpotlightSearchButton from "@/components/SpotlightSearchButton";
import { BackToDashboard, CompactUserMenu } from "@/components/ModuleHeaderNav";
import ComplianceTab from "@/components/hr/ComplianceTab";
import CompliancePaymentsTab from "@/components/hr/CompliancePaymentsTab";
import ComplianceDocumentsTab from "@/components/hr/ComplianceDocumentsTab";
import ComplianceTrademarksTab from "@/components/hr/ComplianceTrademarksTab";
import ComplianceDirectorsTab from "@/components/hr/ComplianceDirectorsTab";
import { useTabs } from "@/lib/layout/useTabs";

const tabContent: Record<string, React.ComponentType> = {
  licences: ComplianceTab,
  payments: CompliancePaymentsTab,
  documents: ComplianceDocumentsTab,
  trademarks: ComplianceTrademarksTab,
  directors: ComplianceDirectorsTab,
};

export default function Compliance() {
  // Tab list, order and default come from the layout registry; each tab is
  // gated by the permission it reads from the API (see PAGE_TABS in
  // src/lib/layout/registry.ts), not just the module-level gate in App.tsx -
  // this is what makes Director KYC disappear for anyone without that
  // permission, with no extra client-side hiding logic needed.
  const { tabs, active: activeTab, setActive: setActiveTab } = useTabs("compliance");
  const ActiveComponent = activeTab ? tabContent[activeTab] : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Compliance
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Licences, payments, documents, trademarks & director KYC</p>
          </div>
          <SpotlightSearchButton className="ml-auto" />
          <CompactUserMenu />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-1.5 flex-wrap mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon!;
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

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {ActiveComponent && <ActiveComponent />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

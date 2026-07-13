import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, CalendarOff, UserSearch, FileCheck, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import HeadcountTab from "@/components/hr/HeadcountTab";
import LeaveTab from "@/components/hr/LeaveTab";
import RecruitmentTab from "@/components/hr/RecruitmentTab";
import DocumentsTab from "@/components/hr/DocumentsTab";

const tabs = [
  { id: "headcount", label: "Headcount & Payroll", icon: Users },
  { id: "leave", label: "Leave & Attendance", icon: CalendarOff },
  { id: "recruitment", label: "Recruitment", icon: UserSearch },
  { id: "documents", label: "Documents", icon: FileCheck },
];

const tabContent: Record<string, React.ComponentType> = {
  headcount: HeadcountTab,
  leave: LeaveTab,
  recruitment: RecruitmentTab,
  documents: DocumentsTab,
};

export default function HR() {
  const [activeTab, setActiveTab] = useState("headcount");
  const ActiveComponent = tabContent[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> CFO Dashboard
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <div>
              <h1 className="text-xl font-bold font-heading text-foreground tracking-tight">HR Module</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Confetti Exports · 3 divisions · 150 employees</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
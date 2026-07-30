import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import DashCard from "@/components/dashboard/DashCard";
import { generateSalarySlip, generateIdCard, monthLabel, type EmployeeDocInfo } from "@/lib/employeeDocs";
import { ArrowLeft, FileText, User as UserIcon, IdCard, Loader2 } from "lucide-react";
import { auth, type SelfEmployeeView, type RosterEntry } from "@/api/auth";

const toDocInfo = (emp: SelfEmployeeView): EmployeeDocInfo => ({
  fullName: emp.fullName,
  employeeId: emp.employeeId,
  division: emp.division,
  role: emp.role,
  photoUrl: emp.photoUrl,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between border-b border-border pb-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-primary hover:underline px-3 py-2 rounded-lg border border-border"
    >
      <FileText className="w-4 h-4 shrink-0" /> {label}
    </a>
  );
}

export default function MyProfile() {
  const { user } = useAuth();
  const emp = user?.employee;
  const [generatingCard, setGeneratingCard] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);

  useEffect(() => {
    if (emp) auth.roster().then(setRoster).catch(() => setRoster([]));
  }, [emp]);

  const downloadIdCard = async () => {
    if (!emp) return;
    setGeneratingCard(true);
    try {
      await generateIdCard(toDocInfo(emp));
    } finally {
      setGeneratingCard(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <h1 className="text-xl font-bold font-heading text-foreground tracking-tight">My Profile</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {!emp ? (
          <DashCard>
            <p className="text-sm text-muted-foreground text-center py-8">
              Your account isn't linked to an employee record - there's nothing to show here.
            </p>
          </DashCard>
        ) : (
          <>
            <DashCard>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  {emp.photoUrl ? (
                    <img src={emp.photoUrl} alt="" className="w-14 h-14 rounded-2xl object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center shrink-0">
                      <UserIcon className="w-7 h-7 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold font-heading text-foreground">{emp.fullName || "-"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[emp.role, emp.division].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadIdCard} disabled={generatingCard}
                  className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {generatingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <IdCard className="w-4 h-4" />} Download ID Card
                </button>
              </div>
            </DashCard>

            <DashCard title="Employment">
              <div className="space-y-2.5 text-sm">
                <Field label="Employee ID" value={emp.employeeId} />
                <Field label="Department" value={emp.division} />
                <Field label="Role" value={emp.role} />
                <Field label="Employment Type" value={emp.employmentType} />
                <Field label="Status" value={emp.status} />
                <Field label="Joining Date" value={emp.joiningDate} />
                <Field label="Monthly Salary" value={emp.monthlySalary ? `₹${emp.monthlySalary.toLocaleString()}` : null} />
              </div>
            </DashCard>

            <DashCard title="My Team">
              {roster === null ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : roster.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No one else in {emp.division || "your department"} yet.</p>
              ) : (
                <div className="space-y-2">
                  {roster.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-b-0">
                      <span className="text-foreground font-medium">{r.fullName || "-"}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{r.role || "-"}</span>
                        {r.status && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{r.status}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashCard>

            <DashCard title="Payroll">
              {emp.payrollRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No payroll recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...emp.payrollRecords].sort((a, b) => b.month.localeCompare(a.month)).map((r) => (
                    <div key={r.month} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-b-0">
                      <span className="text-foreground">{monthLabel(r.month)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{r.grossSalary != null ? `₹${r.grossSalary.toLocaleString()}` : "-"}</span>
                        <button
                          onClick={() => generateSalarySlip(toDocInfo(emp), r)}
                          className="text-xs text-primary hover:underline"
                        >
                          Download Slip
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashCard>

            <DashCard title="Personal & Contact">
              <div className="space-y-2.5 text-sm">
                <Field label="Phone" value={emp.phone} />
                <Field label="Email" value={emp.email} />
                <Field label="Aadhar Number" value={emp.aadharNumber} />
                <Field label="PAN Number" value={emp.panNumber} />
                <Field label="Blood Group" value={emp.bloodGroup} />
                <Field
                  label="Emergency Contact"
                  value={emp.emergencyContactName ? `${emp.emergencyContactName} - ${emp.emergencyContactPhone ?? ""}` : null}
                />
                <Field label="Address" value={emp.address} />
                <Field label="Police Verification" value={emp.policeVerificationStatus} />
              </div>
            </DashCard>

            <DashCard title="Documents">
              {[emp.idProofUrl, emp.aadharUrl, emp.panUrl, emp.offerLetterUrl, emp.contractUrl, emp.policeVerificationUrl, emp.healthRecordUrl]
                .every((u) => !u) ? (
                <p className="text-sm text-muted-foreground text-center py-4">No documents on file yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <DocLink label="ID Proof" url={emp.idProofUrl} />
                  <DocLink label="Aadhar" url={emp.aadharUrl} />
                  <DocLink label="PAN" url={emp.panUrl} />
                  <DocLink label="Offer Letter" url={emp.offerLetterUrl} />
                  <DocLink label="Contract" url={emp.contractUrl} />
                  <DocLink label="Police Verification" url={emp.policeVerificationUrl} />
                  <DocLink label="Health Record" url={emp.healthRecordUrl} />
                </div>
              )}
            </DashCard>
          </>
        )}
      </div>
    </div>
  );
}

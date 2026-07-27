import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicInvite, acceptInvite, type PublicInviteInfo } from "@/api/invitesApi";
import { setToken } from "@/api/http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, User, Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<PublicInviteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    getPublicInvite(token)
      .then(setInvite)
      .catch((err: Error) => setLoadError(err.message || "This invite link is invalid."));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      const { access_token } = await acceptInvite(token, { fullName, password });
      setToken(access_token);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  };

  if (!token || loadError) {
    return (
      <AuthLayout icon={AlertTriangle} title="Invite not available" subtitle={loadError || "No invite token was provided."}>
        <p className="text-sm text-foreground text-center">
          This link may have expired, already been used, or been revoked. Ask whoever invited you for a new one.
        </p>
      </AuthLayout>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="You're invited"
      subtitle={
        invite.invitedBy
          ? `${invite.invitedBy.fullName || invite.invitedBy.email} invited ${invite.email} to Confetti CFO`
          : `Set up your account for ${invite.email}`
      }
    >
      {invite.permissions.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">You'll be granted:</p>
          <div className="flex flex-wrap gap-1.5">
            {invite.permissions.map((p) => (
              <span key={`${p.resource}:${p.action}`} className="text-[11px] px-2 py-0.5 rounded-full bg-background border border-border text-foreground">
                {p.resource}:{p.action}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="fullName" type="text" autoComplete="name" autoFocus
              placeholder="Your name" value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password" type="password" autoComplete="new-password"
              placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm" type="password" autoComplete="new-password"
              placeholder="••••••••" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12" required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Accept invite & create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}

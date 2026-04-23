import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./signin";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // wouter hash-router returns the current path in useLocation; we read the
  // raw hash to pull ?token=... since wouter doesn't parse the query for us.
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    return params.get("token") || "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError("This reset link is missing a token. Please request a new one.");
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center mb-6" data-testid="reset-confirmation">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[hsl(42_90%_40%)]/10 border border-[hsl(42_90%_40%)]/30 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-[hsl(42_90%_30%)]" />
          </div>
          <h1 className="font-serif text-3xl text-primary mb-2">Password updated</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your portal password has been reset. You can now sign in with the new password.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate("/signin")} data-testid="button-reset-signin">
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-primary mb-2">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          Enter a new password for your ${""}portal account.
        </p>
      </div>
      {error && (
        <div
          className="mb-4 p-3 border border-destructive/40 bg-destructive/5 rounded-md text-sm text-destructive flex gap-2"
          data-testid="reset-error"
        >
          <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!token}
            data-testid="input-reset-password"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Minimum 12 characters, with upper, lower, digit, and symbol.
          </p>
        </div>
        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            required
            minLength={12}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={!token}
            data-testid="input-reset-confirm"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !token} data-testid="button-reset-submit">
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
      <div className="mt-6 text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:text-primary"
          data-testid="link-request-new"
        >
          Request a new reset link
        </Link>
      </div>
    </AuthShell>
  );
}

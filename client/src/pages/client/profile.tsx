import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "./layout";
import { Shield, ShieldCheck, AlertTriangle } from "lucide-react";

export default function ClientProfile() {
  const { user, refreshMe } = useAuth();
  const { toast } = useToast();

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Profile &amp; security" subtitle="Manage your contact details, password, and multi-factor authentication." />

      {user?.mustChangePassword && (
        <div className="flex gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-sm">
          <AlertTriangle className="w-5 h-5 flex-none text-destructive" />
          <div>
            <div className="font-medium text-destructive">Password change required</div>
            <div className="text-muted-foreground">
              For your security, please set a new password below before continuing.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Your details</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Field label="Name" value={`${user?.firstName} ${user?.lastName}`} />
          <Field label="Email" value={user?.email || ""} />
          <Field label="Phone" value={user?.phone || "—"} />
          <Field label="Account status" value={user?.status || "—"} />
        </CardContent>
      </Card>

      <ChangePasswordCard onChanged={refreshMe} toast={toast} />
      <MfaCard enabled={!!user?.mfaEnabled} onChanged={() => { refreshMe(); queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); }} toast={toast} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ChangePasswordCard({ onChanged, toast }: { onChanged: () => void; toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"] }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      toast({ title: "Password updated" });
      setCurrent(""); setNew("");
      onChanged();
    } catch (err: any) {
      toast({ title: "Failed to change password", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="font-serif text-lg">Change password</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3 max-w-md">
          <div>
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} data-testid="input-current-password" />
          </div>
          <div>
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" required minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} data-testid="input-new-password" />
            <p className="text-xs text-muted-foreground mt-1">Min 12 chars, with upper, lower, digit, and symbol.</p>
          </div>
          <Button type="submit" disabled={loading} data-testid="button-change-password">
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MfaCard({ enabled, onChanged, toast }: { enabled: boolean; onChanged: () => void; toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"] }) {
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function startSetup() {
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/setup");
      const data = await res.json();
      setQr(data.qr);
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    }
  }

  async function confirm() {
    try {
      await apiRequest("POST", "/api/auth/mfa/enable", { code });
      toast({ title: "MFA enabled" });
      setQr(null); setCode("");
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't verify code", description: err.message, variant: "destructive" });
    }
  }

  async function disable() {
    try {
      await apiRequest("POST", "/api/auth/mfa/disable");
      toast({ title: "MFA disabled" });
      onChanged();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="font-serif text-lg flex items-center gap-2">
        {enabled ? <ShieldCheck className="w-5 h-5 text-[hsl(42_90%_40%)]" /> : <Shield className="w-5 h-5 text-muted-foreground" />}
        Multi-factor authentication
      </CardTitle></CardHeader>
      <CardContent className="text-sm">
        {enabled ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">MFA is active on your account. You'll be prompted for a 6-digit code at each sign-in.</p>
            <Button variant="outline" onClick={disable} data-testid="button-mfa-disable">Disable MFA</Button>
          </div>
        ) : qr ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">Scan this QR code with Google Authenticator, 1Password, Authy, or similar, then enter the 6-digit code below.</p>
            <img src={qr} alt="MFA QR code" className="w-40 h-40 border border-border rounded-md p-2 bg-white" />
            <div className="max-w-xs">
              <Label htmlFor="mfacode">Verification code</Label>
              <Input id="mfacode" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} data-testid="input-mfa-verify" />
            </div>
            <Button onClick={confirm} data-testid="button-mfa-enable">Enable MFA</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground">Add a second layer of security using an authenticator app.</p>
            <Button onClick={startSetup} data-testid="button-mfa-setup">Set up MFA</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

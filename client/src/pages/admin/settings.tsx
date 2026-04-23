import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "../client/layout";
import { ShieldAlert, ShieldCheck, Shield } from "lucide-react";

export default function AdminSettings() {
  const { user, refreshMe } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [loading, setLoading] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      toast({ title: "Password updated" });
      setCurrent(""); setNew("");
      await refreshMe();
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Settings" subtitle="Firm information and your admin account controls." />

      {user?.mustChangePassword && (
        <div className="flex gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-sm">
          <ShieldAlert className="w-5 h-5 flex-none text-destructive" />
          <div>
            <div className="font-medium text-destructive">Please change your password</div>
            <div className="text-muted-foreground">The initial seeded admin password must be changed before continuing.</div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Firm</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="Name">Matloob Tax &amp; Consulting</Row>
          <Row label="Practitioner">Abdul H. Matloob, EA — Enrolled to practice before the Internal Revenue Service</Row>
          <Row label="Office">758B Falmouth Road, Hyannis, MA 02601</Row>
          <Row label="Phone">(508) 258-9890</Row>
          <Row label="Email">contact@matloob-ea.com</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Your admin account</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Row label="Email">{user?.email}</Row>
          <Row label="MFA">{user?.mfaEnabled ? (<span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-[hsl(42_90%_40%)]" /> Enabled</span>) : (<span className="flex items-center gap-1 text-muted-foreground"><Shield className="w-4 h-4" /> Disabled — add MFA from your client profile</span>)}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3 max-w-md">
            <div>
              <Label>Current password</Label>
              <Input type="password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} data-testid="input-admin-current-password" />
            </div>
            <div>
              <Label>New password</Label>
              <Input type="password" required minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} data-testid="input-admin-new-password" />
              <p className="text-xs text-muted-foreground mt-1">Min 12 chars, with upper, lower, digit, and symbol.</p>
            </div>
            <Button type="submit" disabled={loading} data-testid="button-admin-change-password">
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Security posture</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>This portal is built to align with <span className="font-medium text-foreground">IRS Publication 4557</span> safeguards guidance for tax practitioners:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>AES-256-GCM encryption at rest for every uploaded document</li>
            <li>bcrypt password hashing (cost 12) and TOTP multi-factor authentication</li>
            <li>Rate-limited logins with 15-minute lockout after 5 failed attempts</li>
            <li>Session timeout after 2 hours of inactivity, no persistent cookies</li>
            <li>Immutable audit log of authentication, file, and administrative events</li>
          </ul>
          <p className="pt-2">Before using with live client data: deploy over HTTPS, rotate the <code className="text-xs">FILE_ENCRYPTION_KEY</code> and <code className="text-xs">INITIAL_ADMIN_PASSWORD</code>, and complete a Written Information Security Plan (WISP) review.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

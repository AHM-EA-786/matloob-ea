import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../client/layout";
import { ShieldAlert, ArrowRight, Users, Clock, ShieldCheck, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { AdminOnboardingBanner } from "@/components/admin-onboarding-banner";

interface Stats {
  totalClients: number;
  pendingClients: number;
  activeClients: number;
  recentAudit: { id: number; action: string; createdAt: string; userId: number | null; ipAddress: string | null }[];
}

export default function AdminDashboard() {
  const q = useQuery<Stats>({ queryKey: ["/api/admin/stats"] });
  const pending = q.data?.pendingClients ?? 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Firm dashboard"
        subtitle="Matloob Tax & Consulting · Abdul H. Matloob, EA — Enrolled to practice before the Internal Revenue Service."
      />

      <AdminOnboardingBanner totalClients={q.data?.totalClients ?? 0} />

      {pending > 0 && <PendingApprovalsCard count={pending} />}

      <SecurityBanner />

      <div className="grid md:grid-cols-3 gap-4 my-8">
        <Stat label="Total clients" value={q.data?.totalClients ?? "—"} icon={<Users className="w-4 h-4" />} />
        <Stat label="Awaiting approval" value={q.data?.pendingClients ?? "—"} icon={<Clock className="w-4 h-4" />} highlight={!!q.data?.pendingClients} />
        <Stat label="Active" value={q.data?.activeClients ?? "—"} icon={<ShieldCheck className="w-4 h-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-serif text-lg">Recent activity</CardTitle>
            <Link href="/admin/audit">
              <Button variant="ghost" size="sm" data-testid="link-all-audit">
                Full log <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {q.data?.recentAudit?.slice(0, 8).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-1 border-b border-border last:border-0" data-testid={`row-audit-${log.id}`}>
                <span className="font-mono text-xs">{log.action}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(log.createdAt), "MMM d, h:mm a")}
                </span>
              </div>
            ))}
            {!q.data?.recentAudit?.length && <p className="text-muted-foreground">No activity yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-serif text-lg">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <QuickLink href="/admin/clients" label="Review pending signups" />
            <QuickLink href="/admin/files/upload" label="Deliver documents to a client" />
            <QuickLink href="/admin/resources" label="Manage resources feed" />
            <QuickLink href="/admin/audit" label="Review audit log" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PendingApprovalsCard({ count }: { count: number }) {
  const label = count === 1 ? "client awaiting approval" : "clients awaiting approval";
  return (
    <Link href="/admin/clients?filter=pending">
      <a
        className="block my-6 p-5 rounded-md border-2 border-[hsl(42_90%_40%)] bg-[hsl(42_90%_40%)]/10 hover-elevate"
        data-testid="card-pending-approvals"
      >
        <div className="flex items-center gap-4">
          <div className="flex-none w-12 h-12 rounded-full bg-[hsl(42_90%_40%)] text-primary flex items-center justify-center">
            <UserPlus className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-serif text-2xl text-primary leading-tight" data-testid="text-pending-count">
              {count} {label}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Approve with one click — they'll receive an email with sign-in instructions.
            </div>
          </div>
          <ArrowRight className="flex-none w-5 h-5 text-[hsl(42_90%_30%)]" />
        </div>
      </a>
    </Link>
  );
}

function SecurityBanner() {
  return (
    <div className="flex gap-4 p-4 border border-[hsl(42_90%_40%)] bg-[hsl(42_90%_40%)]/10 rounded-md">
      <ShieldAlert className="w-5 h-5 flex-none text-[hsl(42_90%_30%)] mt-0.5" />
      <div className="text-sm">
        <div className="font-medium text-primary mb-0.5">Production use requires HTTPS and a Pub 4557 safeguards review</div>
        <div className="text-muted-foreground">
          This deployed preview is for demonstration — deploy to your own HTTPS
          infrastructure and complete a full IRS Publication 4557 Written Information Security Plan
          review before using with real client data.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: number | string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {label}
          <span>{icon}</span>
        </div>
        <div className={`font-serif text-3xl ${highlight ? "text-[hsl(42_90%_30%)]" : "text-primary"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      <a className="flex items-center justify-between p-3 border border-border rounded-md hover-elevate" data-testid={`link-quick-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        <span>{label}</span>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </a>
    </Link>
  );
}

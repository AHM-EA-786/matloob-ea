import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./layout";
import { useAuth } from "@/contexts/auth";
import { FileUp, FileDown, MessageSquare, ArrowRight } from "lucide-react";
import { format } from "date-fns";

interface FileRow {
  id: number;
  filename: string;
  direction: "client_to_firm" | "firm_to_client";
  sizeBytes: number;
  category: string;
  createdAt: string;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const filesQ = useQuery<{ files: FileRow[] }>({
    queryKey: ["/api/files"],
  });
  const files = filesQ.data?.files || [];
  const uploaded = files.filter((f) => f.direction === "client_to_firm");
  const received = files.filter((f) => f.direction === "firm_to_client");

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title={`Welcome, ${user?.firstName}.`}
        subtitle="Your secure workspace for documents and communication with your Enrolled Agent."
      />

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Files you uploaded" value={uploaded.length} icon={<FileUp className="w-4 h-4" />} />
        <StatCard label="Files from your EA" value={received.length} icon={<FileDown className="w-4 h-4" />} />
        <StatCard label="Account status" value={user?.status || "—"} icon={<MessageSquare className="w-4 h-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-serif text-lg">Recent files</CardTitle>
            <Link href="/client/files">
              <Button variant="ghost" size="sm" data-testid="link-all-files">
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {filesQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!filesQ.isLoading && files.length === 0 && (
              <EmptyState
                title="No files yet"
                body="Upload tax documents or await delivery of your completed return."
              />
            )}
            {files.slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-center justify-between py-1.5 text-sm" data-testid={`row-dashboard-file-${f.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {f.direction === "client_to_firm" ? <FileUp className="w-3.5 h-3.5 flex-none text-muted-foreground" /> : <FileDown className="w-3.5 h-3.5 flex-none text-[hsl(42_90%_40%)]" />}
                  <span className="truncate">{f.filename}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-none">
                  {format(new Date(f.createdAt), "MMM d")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Next steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StepLink href="/client/files" title="Upload tax documents" body="Send W-2s, 1099s, and other records securely." />
            <StepLink href="/client/messages" title="Message your EA" body="Ask questions or share context for your return." />
            <StepLink href="/client/resources" title="Review IRS guidance" body="Official publications, forms, and updates." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {label}
          <span>{icon}</span>
        </div>
        <div className="font-serif text-3xl text-primary">{value}</div>
      </CardContent>
    </Card>
  );
}

function StepLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href}>
      <a className="block p-3 border border-border rounded-md hover-elevate" data-testid={`link-step-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium">{title}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{body}</div>
      </a>
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-6 text-center">
      <div className="font-medium text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{body}</div>
    </div>
  );
}

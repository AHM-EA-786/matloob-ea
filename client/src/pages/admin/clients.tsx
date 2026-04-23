import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "../client/layout";
import { Search, Check, Ban } from "lucide-react";
import { format } from "date-fns";

interface ClientRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: "pending" | "active" | "suspended" | "archived";
  createdAt: string;
  lastLoginAt: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-[hsl(42_90%_40%)]/10 text-[hsl(42_90%_25%)] border-[hsl(42_90%_40%)]/30",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  suspended: "bg-destructive/10 text-destructive border-destructive/30",
  archived: "bg-muted text-muted-foreground border-border",
};

// Read ?filter=pending out of the URL.
// With hash routing the ?… can appear in either location.search
// (when the link is `/admin/clients?filter=pending`) or inside the hash
// (when the link is `/#/admin/clients?filter=pending`). Check both.
function readFilterFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const search = window.location.search || "";
  if (search) {
    const v = new URLSearchParams(search).get("filter");
    if (v) return v;
  }
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  return new URLSearchParams(hash.slice(qIdx + 1)).get("filter");
}

export default function AdminClients() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Seed filter from URL once on mount.
  useEffect(() => {
    const f = readFilterFromUrl();
    if (f && ["pending", "active", "suspended", "archived"].includes(f)) {
      setStatusFilter(f);
    }
  }, []);

  const q = useQuery<{ clients: ClientRow[] }>({ queryKey: ["/api/admin/clients"] });

  const filtered = useMemo(() => {
    const list = q.data?.clients || [];
    return list.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (query) {
        const s = query.toLowerCase();
        return (
          c.email.toLowerCase().includes(s) ||
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [q.data, query, statusFilter]);

  const pendingCount = useMemo(
    () => (q.data?.clients || []).filter((c) => c.status === "pending").length,
    [q.data],
  );

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "active" | "suspended" }) =>
      apiRequest("PATCH", `/api/admin/clients/${id}`, { status }),
    onSuccess: (_res, vars) => {
      toast({
        title: vars.status === "active" ? "Client approved" : "Client suspended",
        description:
          vars.status === "active"
            ? "They'll receive an email with sign-in instructions."
            : "They've been notified that access is paused.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader title="Clients" subtitle="Review, approve, and manage client accounts." />

      {pendingCount > 0 && statusFilter !== "pending" && (
        <button
          onClick={() => setStatusFilter("pending")}
          className="w-full mb-5 p-4 rounded-md border-2 border-[hsl(42_90%_40%)] bg-[hsl(42_90%_40%)]/10 text-left hover-elevate"
          data-testid="banner-pending-shortcut"
        >
          <div className="font-medium text-primary">
            {pendingCount} {pendingCount === 1 ? "client" : "clients"} awaiting approval
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Click to filter</div>
        </button>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="input-client-search" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-client-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!q.isLoading && filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {statusFilter === "pending"
                ? "No pending signups right now. You're all caught up."
                : "No clients match."}
            </div>
          )}
          {filtered.map((c) => {
            const isPending = c.status === "pending";
            return (
              <div
                key={c.id}
                className={`p-4 flex items-center gap-4 ${isPending ? "bg-[hsl(42_90%_40%)]/5" : ""}`}
                data-testid={`row-client-${c.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{c.firstName} {c.lastName}</span>
                    <Badge variant="outline" className={statusColors[c.status]}>{c.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.email} · Joined {format(new Date(c.createdAt), "MMM d, yyyy")}
                    {c.lastLoginAt && ` · Last login ${format(new Date(c.lastLoginAt), "MMM d")}`}
                  </div>
                </div>
                {isPending && (
                  <>
                    <Button
                      size="default"
                      onClick={() => statusMut.mutate({ id: c.id, status: "active" })}
                      disabled={statusMut.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid={`button-approve-${c.id}`}
                    >
                      <Check className="w-4 h-4 mr-1.5" /> Approve
                    </Button>
                    <Button
                      size="default"
                      variant="outline"
                      onClick={() => statusMut.mutate({ id: c.id, status: "suspended" })}
                      disabled={statusMut.isPending}
                      className="border-destructive/40 text-destructive hover:bg-destructive/5"
                      data-testid={`button-suspend-${c.id}`}
                    >
                      <Ban className="w-4 h-4 mr-1.5" /> Suspend
                    </Button>
                  </>
                )}
                {c.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMut.mutate({ id: c.id, status: "suspended" })}
                    disabled={statusMut.isPending}
                    className="border-destructive/30 text-destructive hover:bg-destructive/5"
                    data-testid={`button-suspend-active-${c.id}`}
                  >
                    Suspend
                  </Button>
                )}
                {c.status === "suspended" && (
                  <Button
                    size="sm"
                    onClick={() => statusMut.mutate({ id: c.id, status: "active" })}
                    disabled={statusMut.isPending}
                    data-testid={`button-reactivate-${c.id}`}
                  >
                    Reactivate
                  </Button>
                )}
                <Link href={`/admin/clients/${c.id}`}>
                  <Button size="sm" variant="outline" data-testid={`button-view-${c.id}`}>View</Button>
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../client/layout";
import { format } from "date-fns";
import { Search } from "lucide-react";

interface AuditRow {
  id: number;
  userId: number | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: string;
}

export default function AdminAudit() {
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const limit = 100;
  const q = useQuery<{ logs: AuditRow[]; total: number }>({
    queryKey: ["/api/admin/audit", `?limit=${limit}&offset=${offset}`],
  });
  const filtered = (q.data?.logs || []).filter((l) =>
    !query ? true : l.action.includes(query.toLowerCase()) || (l.ipAddress || "").includes(query),
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader title="Audit log" subtitle="Immutable record of logins, file operations, and administrative actions." />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Filter by action or IP" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="input-audit-search" />
        </div>
        <div className="text-xs text-muted-foreground">Total: {q.data?.total ?? 0}</div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">When</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">User</th>
                  <th className="p-3 font-medium">Target</th>
                  <th className="p-3 font-medium">IP</th>
                  <th className="p-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-t border-border" data-testid={`row-audit-log-${l.id}`}>
                    <td className="p-3 text-xs whitespace-nowrap text-muted-foreground">
                      {format(new Date(l.createdAt), "MMM d, yyyy h:mm:ss a")}
                    </td>
                    <td className="p-3 font-mono text-xs">{l.action}</td>
                    <td className="p-3 text-xs">{l.userId ?? "—"}</td>
                    <td className="p-3 text-xs">{l.targetType ? `${l.targetType}#${l.targetId}` : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{l.ipAddress || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono max-w-[300px] truncate">{l.metadata || ""}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">No logs match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mt-4">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} data-testid="button-audit-prev">
          Previous
        </Button>
        <div className="text-xs text-muted-foreground">Rows {offset + 1}–{offset + (q.data?.logs?.length ?? 0)}</div>
        <Button variant="outline" size="sm" disabled={(q.data?.logs?.length ?? 0) < limit} onClick={() => setOffset(offset + limit)} data-testid="button-audit-next">
          Next
        </Button>
      </div>
    </div>
  );
}

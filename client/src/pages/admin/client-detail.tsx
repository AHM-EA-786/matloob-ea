import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient, getAuthToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "../client/layout";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, FileUp, FileDown, Download } from "lucide-react";
import { format } from "date-fns";

interface Detail {
  client: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: "pending" | "active" | "suspended" | "archived";
    createdAt: string;
  };
  files: {
    id: number;
    filename: string;
    direction: "client_to_firm" | "firm_to_client";
    sizeBytes: number;
    category: string;
    createdAt: string;
  }[];
  notes: { id: number; body: string; createdAt: string }[];
  messages: { id: number; fromUserId: number; body: string; createdAt: string }[];
}

export default function AdminClientDetail({ id }: { id: number }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const q = useQuery<Detail>({ queryKey: ["/api/admin/clients", id] });

  const mut = useMutation({
    mutationFn: async (patch: any) =>
      apiRequest("PATCH", `/api/admin/clients/${id}`, patch),
    onSuccess: () => {
      toast({ title: "Saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  async function download(fileId: number, filename: string) {
    const token = getAuthToken();
    const res = await fetch(`/api/files/${fileId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  if (q.isLoading) return <div className="p-8">Loading…</div>;
  if (!q.data) return <div className="p-8">Not found.</div>;

  const { client, files, notes, messages } = q.data;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/admin/clients">
        <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-clients">
          <ChevronLeft className="w-4 h-4" /> Back to clients
        </a>
      </Link>

      <PageHeader
        title={`${client.firstName} ${client.lastName}`}
        subtitle={`${client.email}${client.phone ? " · " + client.phone : ""}`}
        actions={
          <>
            <Badge variant="outline">{client.status}</Badge>
          </>
        }
      />

      <div className="grid md:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="font-serif text-lg">Files</CardTitle></CardHeader>
            <CardContent className="p-0">
              {files.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No files yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {files.map((f) => (
                    <div key={f.id} className="p-4 flex items-center gap-3" data-testid={`row-admin-file-${f.id}`}>
                      {f.direction === "client_to_firm" ? <FileUp className="w-4 h-4 text-muted-foreground" /> : <FileDown className="w-4 h-4 text-[hsl(42_90%_40%)]" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{f.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.category} · {format(new Date(f.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => download(f.id, f.filename)} data-testid={`button-admin-download-${f.id}`}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4 border-t border-border">
                <Link href={`/admin/files/upload?clientId=${client.id}`}>
                  <Button size="sm" variant="outline" data-testid="link-admin-upload">Send a file to this client</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-serif text-lg">Messages</CardTitle></CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No messages yet.</p>
              ) : (
                <div className="space-y-2">
                  {messages.map((m) => (
                    <div key={m.id} className="p-3 bg-muted rounded-md text-sm" data-testid={`row-admin-msg-${m.id}`}>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{format(new Date(m.createdAt), "MMM d, h:mm a")}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="font-serif text-lg">Engagement</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                <Select value={client.status} onValueChange={(v) => mut.mutate({ status: v })}>
                  <SelectTrigger data-testid="select-admin-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Joined</div>
                {format(new Date(client.createdAt), "MMMM d, yyyy")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-serif text-lg">Internal notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Add a private note…"
                data-testid="input-admin-note"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!note.trim()) return;
                  mut.mutate({ note });
                  setNote("");
                }}
                data-testid="button-admin-save-note"
              >
                Save note
              </Button>
              <div className="space-y-2 pt-2 border-t border-border">
                {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
                {notes.map((n) => (
                  <div key={n.id} className="text-xs p-2 bg-muted rounded" data-testid={`row-note-${n.id}`}>
                    <div className="whitespace-pre-wrap">{n.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{format(new Date(n.createdAt), "MMM d, yyyy h:mm a")}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

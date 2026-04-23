import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "../client/layout";
import { ResourcesBrowser, LiveNewsPanel, type ResourceRow } from "../client/resources";
import { RefreshCw, Plus, Pin, Trash2, Radio } from "lucide-react";

export default function AdminResources() {
  const { toast } = useToast();
  const q = useQuery<{ resources: ResourceRow[] }>({ queryKey: ["/api/resources"] });

  const refreshMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/resources/refresh"),
    onSuccess: () => { toast({ title: "Resources refreshed" }); queryClient.invalidateQueries({ queryKey: ["/api/resources"] }); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const refreshNewsMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/resources/refresh-news"),
    onSuccess: () => {
      toast({ title: "Live news refreshed" });
      queryClient.invalidateQueries({ queryKey: ["/api/resources/news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    },
    onError: (err: any) => toast({ title: "News refresh failed", description: err.message, variant: "destructive" }),
  });

  const pinMut = useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) =>
      apiRequest("PATCH", `/api/resources/${id}`, { isPinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/resources"] }),
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/resources/${id}`),
    onSuccess: () => { toast({ title: "Deleted" }); queryClient.invalidateQueries({ queryKey: ["/api/resources"] }); },
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Resources"
        subtitle="Manage the IRS and Massachusetts DOR publication feed that clients see."
        actions={
          <>
            <AddResourceDialog />
            <Button variant="outline" onClick={() => refreshNewsMut.mutate()} disabled={refreshNewsMut.isPending} data-testid="button-refresh-news">
              <Radio className={`w-4 h-4 mr-2 ${refreshNewsMut.isPending ? "animate-pulse" : ""}`} />
              Refresh news
            </Button>
            <Button variant="outline" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} data-testid="button-refresh-resources">
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshMut.isPending ? "animate-spin" : ""}`} />
              Reload feed
            </Button>
          </>
        }
      />
      <LiveNewsPanel />
      <ResourcesBrowser
        resources={q.data?.resources || []}
        loading={q.isLoading}
        adminActions={(r) => (
          <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); pinMut.mutate({ id: r.id, isPinned: !r.isPinned }); }}
              data-testid={`button-pin-${r.id}`}
            >
              <Pin className={`w-3.5 h-3.5 ${r.isPinned ? "text-[hsl(42_90%_40%)] fill-[hsl(42_90%_40%)]" : ""}`} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); if (confirm("Delete this resource?")) delMut.mutate(r.id); }}
              data-testid={`button-delete-resource-${r.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      />
    </div>
  );
}

function AddResourceDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    source: "IRS" as "IRS" | "MA_DOR",
    category: "publications",
    title: "",
    summary: "",
    url: "",
    pubDate: "",
  });
  const mut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/resources", {
      ...form,
      pubDate: form.pubDate || null,
      isPinned: false,
    }),
    onSuccess: () => {
      toast({ title: "Resource added" });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setOpen(false);
      setForm({ source: "IRS", category: "publications", title: "", summary: "", url: "", pubDate: "" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-resource"><Plus className="w-4 h-4 mr-2" />Add resource</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a resource</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v: any) => setForm({ ...form, source: v })}>
                <SelectTrigger data-testid="select-add-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IRS">IRS</SelectItem>
                  <SelectItem value="MA_DOR">Massachusetts DOR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="input-add-category" />
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-add-title" />
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} data-testid="input-add-summary" />
          </div>
          <div>
            <Label>URL (must be .gov)</Label>
            <Input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} data-testid="input-add-url" />
          </div>
          <div>
            <Label>Publication date (YYYY-MM-DD, optional)</Label>
            <Input value={form.pubDate} onChange={(e) => setForm({ ...form, pubDate: e.target.value })} placeholder="2024-12-01" data-testid="input-add-pubdate" />
          </div>
          <Button type="submit" disabled={mut.isPending} data-testid="button-submit-resource">
            {mut.isPending ? "Saving…" : "Add resource"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

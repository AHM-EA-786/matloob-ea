import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "../client/layout";
import { Upload } from "lucide-react";

interface ClientRow { id: number; firstName: string; lastName: string; email: string; status: string; }

export default function AdminFilesUpload() {
  const { toast } = useToast();
  const clientsQ = useQuery<{ clients: ClientRow[] }>({ queryKey: ["/api/admin/clients"] });
  const preselectId = new URLSearchParams(window.location.hash.split("?")[1] || "").get("clientId");
  const [clientId, setClientId] = useState<string>(preselectId || "");
  const [category, setCategory] = useState("other");
  const [taxYear, setTaxYear] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clientId && clientsQ.data?.clients?.length && !preselectId) {
      const active = clientsQ.data.clients.find((c) => c.status === "active");
      if (active) setClientId(String(active.id));
    }
  }, [clientsQ.data, clientId, preselectId]);

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length || !clientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("ownerId", clientId);
        fd.append("direction", "firm_to_client");
        fd.append("category", category);
        if (taxYear) fd.append("taxYear", taxYear);
        if (description) fd.append("description", description);
        await apiRequest("POST", "/api/files/upload", fd);
      }
      toast({ title: "Uploaded", description: `${list.length} file(s) delivered.` });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      setDescription("");
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader title="Send files to a client" subtitle="Upload completed returns, correspondence, or reference documents. Files are encrypted at rest." />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-upload-client"><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {clientsQ.data?.clients?.filter(c => c.status === "active").map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.firstName} {c.lastName} · {c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-upload-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax_return">Tax return</SelectItem>
                  <SelectItem value="w2">W-2</SelectItem>
                  <SelectItem value="1099">1099</SelectItem>
                  <SelectItem value="id_doc">ID document</SelectItem>
                  <SelectItem value="correspondence">Correspondence</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tax year</Label>
              <Input inputMode="numeric" value={taxYear} onChange={(e) => setTaxYear(e.target.value)} placeholder="e.g. 2024" data-testid="input-upload-taxyear" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" data-testid="input-upload-description" />
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-[hsl(42_90%_45%)] bg-accent/10" : "border-border hover:border-muted-foreground/50"}`}
            data-testid="dropzone-admin-upload"
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <div className="font-medium">{uploading ? "Uploading…" : "Drop files here or click to browse"}</div>
            <div className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG, XLSX, DOCX, CSV, TXT · 50 MB max</div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} data-testid="input-admin-file" />
          </div>

          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={!clientId || uploading} data-testid="button-admin-browse">
            Browse files
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

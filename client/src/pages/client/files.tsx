import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthToken } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "./layout";
import { FileUp, FileDown, Upload, Download, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface FileRow {
  id: number;
  filename: string;
  direction: "client_to_firm" | "firm_to_client";
  sizeBytes: number;
  mimeType: string;
  category: string;
  taxYear: number | null;
  description: string | null;
  uploadedBy: number;
  ownerId: number;
  createdAt: string;
}

const CATEGORIES = [
  { value: "tax_return", label: "Tax return" },
  { value: "w2", label: "W-2" },
  { value: "1099", label: "1099" },
  { value: "id_doc", label: "ID document" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

export default function ClientFiles() {
  const { toast } = useToast();
  const [category, setCategory] = useState("other");
  const [taxYear, setTaxYear] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filesQ = useQuery<{ files: FileRow[] }>({ queryKey: ["/api/files"] });
  const files = filesQ.data?.files || [];
  const uploaded = files.filter((f) => f.direction === "client_to_firm");
  const received = files.filter((f) => f.direction === "firm_to_client");

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", category);
        if (taxYear) fd.append("taxYear", taxYear);
        if (description) fd.append("description", description);
        await apiRequest("POST", "/api/files/upload", fd);
      }
      toast({ title: "Upload complete", description: `${list.length} file(s) sent securely.` });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      setDescription("");
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/files/${id}`);
    },
    onSuccess: () => {
      toast({ title: "File deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  async function download(f: FileRow) {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/files/${f.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader title="Files" subtitle="Send documents to your EA and download completed work. All files are encrypted at rest." />

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="taxYear">Tax year (optional)</Label>
              <Input
                id="taxYear"
                inputMode="numeric"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                placeholder="e.g. 2024"
                data-testid="input-taxyear"
              />
            </div>
            <div>
              <Label htmlFor="desc">Description (optional)</Label>
              <Input
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. W-2 from Cape Cod Hospital"
                data-testid="input-description"
              />
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-[hsl(42_90%_45%)] bg-accent/10" : "border-border hover:border-muted-foreground/50"}`}
            data-testid="dropzone-upload"
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <div className="font-medium">{uploading ? "Uploading…" : "Drop files here or click to browse"}</div>
            <div className="text-xs text-muted-foreground mt-1">
              PDF, PNG, JPG, XLSX, DOCX, CSV, TXT · 50 MB max
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt"
              onChange={(e) => handleFiles(e.target.files)}
              data-testid="input-file"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="uploaded">
        <TabsList>
          <TabsTrigger value="uploaded" data-testid="tab-uploaded">
            Files I uploaded ({uploaded.length})
          </TabsTrigger>
          <TabsTrigger value="received" data-testid="tab-received">
            Files from my EA ({received.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="uploaded">
          <FileList files={uploaded} onDownload={download} onDelete={(id) => deleteMut.mutate(id)} canDelete />
        </TabsContent>
        <TabsContent value="received">
          <FileList files={received} onDownload={download} onDelete={() => {}} canDelete={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FileList({
  files,
  onDownload,
  onDelete,
  canDelete,
}: {
  files: FileRow[];
  onDownload: (f: FileRow) => void;
  onDelete: (id: number) => void;
  canDelete: boolean;
}) {
  if (!files.length) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <FileUp className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No files here yet.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-4 p-4" data-testid={`row-file-${f.id}`}>
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-none">
              {f.direction === "client_to_firm" ? (
                <FileUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <FileDown className="w-4 h-4 text-[hsl(42_90%_40%)]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{f.filename}</div>
              <div className="text-xs text-muted-foreground">
                {CATEGORIES.find((c) => c.value === f.category)?.label || f.category}
                {f.taxYear ? ` · Tax year ${f.taxYear}` : ""} ·{" "}
                {formatBytes(f.sizeBytes)} · {format(new Date(f.createdAt), "MMM d, yyyy")}
              </div>
              {f.description && <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => onDownload(f)} data-testid={`button-download-${f.id}`}>
              <Download className="w-4 h-4" />
            </Button>
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm("Delete this file?")) onDelete(f.id);
                }}
                data-testid={`button-delete-${f.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

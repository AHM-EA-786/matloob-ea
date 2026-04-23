import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { PageHeader } from "./layout";
import { format } from "date-fns";

interface MessageRow {
  id: number;
  clientId: number;
  fromUserId: number;
  body: string;
  createdAt: string;
}

export default function ClientMessages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState("");

  const q = useQuery<{ messages: MessageRow[] }>({ queryKey: ["/api/messages"] });
  const messages = q.data?.messages || [];

  const sendMut = useMutation({
    mutationFn: async (b: string) => apiRequest("POST", "/api/messages", { body: b }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
    onError: (err: any) => toast({ title: "Failed to send", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader title="Messages" subtitle="Direct communication with Matloob Tax & Consulting." />
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                No messages yet. Send one below to start the conversation.
              </p>
            )}
            {messages.map((m) => {
              const isMe = user && m.fromUserId === user.id;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {format(new Date(m.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) sendMut.mutate(body.trim());
            }}
            className="space-y-2 border-t border-border pt-4"
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Type a message to your EA…"
              data-testid="input-message"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!body.trim() || sendMut.isPending} data-testid="button-send-message">
                {sendMut.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

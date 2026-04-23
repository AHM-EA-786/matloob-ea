import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./signin";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Phone, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
      const data = await res.json().catch(() => ({}));
      setEmailSent(!!data?.emailSent);
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Could not submit", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell>
        <div className="text-center mb-6" data-testid="forgot-confirmation">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[hsl(42_90%_40%)]/10 border border-[hsl(42_90%_40%)]/30 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-[hsl(42_90%_30%)]" />
          </div>
          <h1 className="font-serif text-3xl text-primary mb-2">Check your inbox</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {emailSent ? (
              <>
                If an account exists for <span className="text-foreground font-medium">{email}</span>, a secure reset
                link is on its way. The link expires in one hour.
              </>
            ) : (
              <>
                Email delivery isn't configured on this server yet. Please contact the firm directly and we'll reset
                your password with a one-time link.
              </>
            )}
          </p>
        </div>
        <div className="space-y-3 text-sm mb-6">
          <a
            href="tel:+15082589890"
            className="flex items-center gap-3 p-4 rounded-md border border-border hover-elevate bg-card"
            data-testid="link-call-firm"
          >
            <Phone className="w-4 h-4 text-[hsl(42_90%_40%)]" />
            <div>
              <div className="font-medium">Call the office</div>
              <div className="text-muted-foreground text-xs">(508) 258-9890</div>
            </div>
          </a>
          <a
            href="mailto:contact@matloob-ea.com?subject=Portal%20password%20reset"
            className="flex items-center gap-3 p-4 rounded-md border border-border hover-elevate bg-card"
            data-testid="link-email-firm"
          >
            <Mail className="w-4 h-4 text-[hsl(42_90%_40%)]" />
            <div>
              <div className="font-medium">Email us</div>
              <div className="text-muted-foreground text-xs">contact@matloob-ea.com</div>
            </div>
          </a>
        </div>
        <Link href="/signin">
          <Button variant="outline" className="w-full" data-testid="button-back-signin">
            Back to sign in
          </Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-primary mb-2">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email on your portal account and we'll send a secure reset link. The link expires in one hour.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-forgot-email"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading} data-testid="button-forgot-submit">
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <div className="mt-6 text-center">
        <Link href="/signin" className="text-sm text-muted-foreground hover:text-primary" data-testid="link-back-signin">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

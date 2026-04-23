import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/logo";

export default function SignIn() {
  const { signin } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signin(email, password, mfaCode || undefined);
      if (result.requiresMfa) {
        setNeedsMfa(true);
        toast({ title: "MFA required", description: "Enter your 6-digit code." });
        return;
      }
      // Slight defer so the auth context state flushes before the RequireRole guard reads it.
      const role = result.user?.role;
      setTimeout(() => {
        if (role === "admin") navigate("/admin");
        else navigate("/client");
      }, 0);
    } catch (err: any) {
      toast({ title: "Sign-in failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-primary mb-1">Sign in</h1>
        <p className="text-sm text-muted-foreground">Access your Matloob Tax &amp; Consulting portal.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-email"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground" data-testid="link-forgot">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="input-password"
          />
        </div>
        {needsMfa && (
          <div>
            <Label htmlFor="mfa">Authenticator code</Label>
            <Input
              id="mfa"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              data-testid="input-mfa"
            />
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading} data-testid="button-signin-submit">
          {loading ? "Signing in…" : needsMfa ? "Verify & sign in" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground mt-6 text-center">
        Don't have an account?{" "}
        <Link href="/signup" className="text-primary font-medium hover:underline" data-testid="link-goto-signup">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background grid md:grid-cols-2">
      {/* Marketing panel */}
      <aside className="hidden md:flex flex-col justify-between p-10 bg-primary text-primary-foreground">
        <Link href="/"><Logo variant="light" /></Link>
        <div className="max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[hsl(42_90%_60%)] mb-4">Your tax workspace</p>
          <h2 className="font-serif text-4xl leading-tight mb-4">
            A private, encrypted portal for documents and messages.
          </h2>
          <p className="text-sm text-primary-foreground/75 leading-relaxed">
            Abdul H. Matloob, EA — Enrolled to practice before the Internal Revenue Service.
            Office: 758B Falmouth Road, Hyannis, MA 02601 · (508) 258-9890
          </p>
        </div>
        <p className="text-xs text-primary-foreground/50">
          © {new Date().getFullYear()} Matloob Tax &amp; Consulting
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-8">
            <Link href="/"><Logo /></Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

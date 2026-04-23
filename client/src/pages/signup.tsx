import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AuthShell } from "./signin";
import { CheckCircle2, Mail, Phone, Home, Clock, Inbox, ShieldCheck } from "lucide-react";

interface SignupState {
  phase: "form" | "confirmed";
  firstName: string;
  email: string;
  emailSent: boolean;
}

export default function SignUp() {
  const { signup } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<SignupState>({
    phase: "form",
    firstName: "",
    email: "",
    emailSent: false,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signup(form);
      setState({
        phase: "confirmed",
        firstName: form.firstName,
        email: form.email,
        emailSent: result.emailSent,
      });
    } catch (err: any) {
      toast({ title: "Sign-up failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (state.phase === "confirmed") {
    return <SignupConfirmation firstName={state.firstName} email={state.email} emailSent={state.emailSent} />;
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-primary mb-1">Create account</h1>
        <p className="text-sm text-muted-foreground">
          New clients: fill in the form and we'll approve your access within one business day.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              data-testid="input-firstname"
            />
          </div>
          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              data-testid="input-lastname"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            data-testid="input-email"
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            data-testid="input-phone"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            data-testid="input-password"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Minimum 12 characters, with upper, lower, digit, and symbol.
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={loading} data-testid="button-signup-submit">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground mt-6 text-center">
        Already have an account?{" "}
        <Link href="/signin" className="text-primary font-medium hover:underline" data-testid="link-goto-signin">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function SignupConfirmation({
  firstName,
  email,
  emailSent,
}: {
  firstName: string;
  email: string;
  emailSent: boolean;
}) {
  return (
    <AuthShell>
      <div className="text-center mb-7" data-testid="signup-confirmation">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[hsl(42_90%_40%)]/10 border border-[hsl(42_90%_40%)]/30 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-[hsl(42_90%_30%)]" />
        </div>
        <h1 className="font-serif text-3xl text-primary mb-2">Thanks for signing up</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {emailSent ? (
            <>
              We've received your request to create a portal account, {firstName}. Abdul will review it shortly —
              typically within one business day. Once approved, you'll receive an email with sign-in instructions at{" "}
              <span className="text-foreground font-medium">{email}</span>.
            </>
          ) : (
            <>
              Your account has been created, {firstName}. Abdul will notify you directly at{" "}
              <span className="text-foreground font-medium">{email}</span> once it's been activated.
            </>
          )}
        </p>
      </div>

      <div className="space-y-2.5 mb-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">What to expect</div>
        <ChecklistItem
          icon={<Clock className="w-4 h-4" />}
          title="We review your request"
          detail="Usually within one business day."
        />
        <ChecklistItem
          icon={<Inbox className="w-4 h-4" />}
          title={emailSent ? "You receive an approval email" : "Abdul contacts you directly"}
          detail={emailSent ? "Sent to the address above." : "By phone or email once activated."}
        />
        <ChecklistItem
          icon={<ShieldCheck className="w-4 h-4" />}
          title="You sign in and start exchanging documents"
          detail="Everything is encrypted at rest."
        />
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-2 mb-6" data-testid="confirmation-contact">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Urgent question?</div>
        <a
          href="tel:+15082589890"
          className="flex items-center gap-2.5 text-sm hover:text-primary"
          data-testid="link-confirmation-call"
        >
          <Phone className="w-4 h-4 text-[hsl(42_90%_40%)]" />
          <span>(508) 258-9890</span>
        </a>
        <a
          href="mailto:contact@matloob-ea.com"
          className="flex items-center gap-2.5 text-sm hover:text-primary"
          data-testid="link-confirmation-email"
        >
          <Mail className="w-4 h-4 text-[hsl(42_90%_40%)]" />
          <span>contact@matloob-ea.com</span>
        </a>
      </div>

      <Link href="/">
        <Button variant="outline" className="w-full" data-testid="button-return-home">
          <Home className="w-4 h-4 mr-2" /> Return to home
        </Button>
      </Link>
    </AuthShell>
  );
}

function ChecklistItem({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-md border border-border bg-card">
      <div className="flex-none w-7 h-7 rounded-full bg-[hsl(42_90%_40%)]/10 text-[hsl(42_90%_30%)] flex items-center justify-center">
        {icon}
      </div>
      <div className="text-sm">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

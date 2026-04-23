import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, UserPlus, CheckCircle2, Upload, X } from "lucide-react";

/**
 * Admin onboarding banner — shown on the dashboard when the firm has zero
 * clients (fresh install). Dismissible for the current session via in-memory
 * React state; re-appears if Abdul reloads the page with no clients yet,
 * which is acceptable because the signal ("no clients") itself disappears
 * once the first signup arrives.
 *
 * No localStorage / sessionStorage / cookies — those are blocked in the
 * portal's deployed iframe.
 */
export function AdminOnboardingBanner({ totalClients }: { totalClients: number }) {
  const [dismissed, setDismissed] = useState(false);

  // Only surface when zero clients exist — and the user hasn't dismissed it this session.
  if (totalClients > 0 || dismissed) return null;

  const portalUrl =
    typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}#/signup` : "/signup";

  return (
    <Card className="mb-6 border-primary/30 bg-primary/[0.03]" data-testid="admin-onboarding-banner">
      <CardContent className="p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-none w-10 h-10 rounded-full bg-[hsl(42_90%_40%)]/15 text-[hsl(42_90%_30%)] flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-xl text-primary mb-1">Welcome to your portal admin</h2>
            <p className="text-sm text-muted-foreground">
              A quick tour of how client intake works.
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="flex-none text-muted-foreground hover:text-primary p-1 rounded-md hover-elevate"
            aria-label="Dismiss onboarding banner"
            data-testid="button-dismiss-onboarding"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Here's how it works</div>
        <div className="relative space-y-1 mb-5">
          <TimelineStep
            step={1}
            icon={<UserPlus className="w-4 h-4" />}
            title="Clients sign up at the public portal"
            detail={
              <span>
                Direct them to{" "}
                <span className="font-mono text-xs text-primary break-all" data-testid="text-portal-signup-url">
                  {portalUrl}
                </span>
                .
              </span>
            }
          />
          <TimelineStep
            step={2}
            icon={<UserPlus className="w-4 h-4" />}
            title="You see their signup here under Clients"
            detail="A pending card appears on this dashboard the moment they register."
          />
          <TimelineStep
            step={3}
            icon={<CheckCircle2 className="w-4 h-4" />}
            title="Approve with one click"
            detail="They receive an email with sign-in instructions automatically (once SMTP is configured)."
          />
          <TimelineStep
            step={4}
            icon={<Upload className="w-4 h-4" />}
            title="Exchange documents securely"
            detail="Upload their tax documents; they upload theirs. All files are encrypted at rest."
            last
          />
        </div>

        <Button onClick={() => setDismissed(true)} size="sm" data-testid="button-onboarding-ack">
          Got it
        </Button>
      </CardContent>
    </Card>
  );
}

function TimelineStep({
  step,
  icon,
  title,
  detail,
  last,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  detail: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3 relative">
      <div className="flex-none flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
          {step}
        </div>
        {!last && <div className="flex-1 w-px bg-border my-1" />}
      </div>
      <div className={`flex-1 ${last ? "" : "pb-4"}`}>
        <div className="flex items-center gap-2">
          <span className="text-[hsl(42_90%_30%)]">{icon}</span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 ml-6">{detail}</div>
      </div>
    </div>
  );
}

import { Link } from "wouter";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Lock, FileText, Shield, Clock } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/signin">
              <Button variant="ghost" data-testid="link-signin">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button data-testid="link-signup">Create account</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 grid md:grid-cols-[1.2fr_1fr] gap-12 items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[hsl(42_90%_35%)] mb-6">
              Secure Client Portal
            </p>
            <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] text-primary mb-6">
              Exchange tax documents with your Enrolled Agent—privately.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
              A protected workspace for clients of Matloob Tax &amp; Consulting.
              Upload returns, W-2s, and correspondence, message Abdul directly, and
              review official IRS and Massachusetts DOR guidance in one place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup">
                <Button size="lg" data-testid="button-cta-signup">Create your client account</Button>
              </Link>
              <Link href="/signin">
                <Button size="lg" variant="outline" data-testid="button-cta-signin">
                  Sign in
                </Button>
              </Link>
            </div>
            <p className="text-sm text-muted-foreground mt-6">
              Abdul H. Matloob, EA · Enrolled to practice before the Internal Revenue Service
            </p>
          </div>

          <aside className="bg-primary text-primary-foreground rounded-lg p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-5">
              <Shield className="w-5 h-5 text-[hsl(42_90%_55%)]" />
              <span className="font-serif text-lg">Built for safeguarding</span>
            </div>
            <ul className="space-y-4 text-sm text-primary-foreground/85">
              <li className="flex gap-3">
                <Lock className="w-4 h-4 mt-0.5 flex-none text-[hsl(42_90%_55%)]" />
                <span>AES-256-GCM encryption at rest for every uploaded document</span>
              </li>
              <li className="flex gap-3">
                <Shield className="w-4 h-4 mt-0.5 flex-none text-[hsl(42_90%_55%)]" />
                <span>Administrator approval, TOTP multi-factor authentication, and session timeouts</span>
              </li>
              <li className="flex gap-3">
                <FileText className="w-4 h-4 mt-0.5 flex-none text-[hsl(42_90%_55%)]" />
                <span>Detailed audit log of every sign-in, upload, and download</span>
              </li>
              <li className="flex gap-3">
                <Clock className="w-4 h-4 mt-0.5 flex-none text-[hsl(42_90%_55%)]" />
                <span>Aligned with IRS Publication 4557 safeguards guidance for tax preparers</span>
              </li>
            </ul>
          </aside>
        </section>

        {/* Feature row */}
        <section className="border-t border-border bg-card">
          <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-3 gap-8">
            <Feature
              title="Secure document exchange"
              body="Upload W-2s, 1099s, receipts, and prior returns in PDF, image, or spreadsheet format. Your EA can return completed work the same way."
            />
            <Feature
              title="Official guidance at your fingertips"
              body="A curated feed of IRS forms, publications, and Massachusetts DOR updates—no digging through government sites."
            />
            <Feature
              title="Direct line to your EA"
              body="Send messages about your return, ask questions, and get answers without email clutter."
            />
          </div>
        </section>

        {/* Contact */}
        <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10">
          <div>
            <h2 className="font-serif text-3xl text-primary mb-4">Matloob Tax &amp; Consulting</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              Abdul H. Matloob is an Enrolled Agent — a federally licensed tax practitioner
              enrolled to practice before the Internal Revenue Service.
            </p>
            <dl className="text-sm space-y-1.5">
              <div className="flex gap-2"><dt className="text-muted-foreground w-16">Office</dt><dd>758B Falmouth Road, Hyannis, MA 02601</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-16">Phone</dt><dd>(508) 258-9890</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-16">Email</dt><dd>contact@matloob-ea.com</dd></div>
            </dl>
          </div>
          <div className="bg-muted/50 border border-border rounded-lg p-6">
            <h3 className="font-serif text-lg text-primary mb-2">New client?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create an account and an administrator will review and approve your access
              within one business day.
            </p>
            <Link href="/signup">
              <Button className="w-full" data-testid="button-footer-signup">Create account</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Matloob Tax &amp; Consulting. All rights reserved.</span>
          <a
            href="https://matloobtaxandconsulting.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
            data-testid="link-marketing-site"
          >
            ← Back to matloobtaxandconsulting.com
          </a>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="w-10 h-[2px] bg-[hsl(42_90%_45%)] mb-4" />
      <h3 className="font-serif text-xl text-primary mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

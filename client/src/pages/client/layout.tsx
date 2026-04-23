import { ReactNode, useEffect } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, BookOpen, User, MessageSquare, LogOut, Moon, Sun } from "lucide-react";
import { useState } from "react";

const NAV = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/files", label: "Files", icon: FileText },
  { href: "/client/messages", label: "Messages", icon: MessageSquare },
  { href: "/client/resources", label: "Resources", icon: BookOpen },
  { href: "/client/profile", label: "Profile", icon: User },
];

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { user, signout, refreshMe } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    if (!user) refreshMe();
  }, [user, refreshMe]);

  if (user?.mustChangePassword && !location.endsWith("/profile")) {
    return <Redirect to="/client/profile" />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <Logo variant="light" />
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover-elevate ${active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80"}`}
                  data-testid={`link-nav-${item.label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium text-sidebar-foreground">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
          </div>
          <ThemeToggle />
          <button
            onClick={() => signout()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover-elevate"
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  }
  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover-elevate"
      data-testid="button-theme-toggle"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 mb-8">
      <div>
        <h1 className="font-serif text-3xl text-primary leading-tight mb-1">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-none">{actions}</div>}
    </div>
  );
}

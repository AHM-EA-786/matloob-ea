import { ReactNode, useEffect } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/logo";
import { LayoutDashboard, Users, Upload, BookOpen, ShieldCheck, Settings, LogOut } from "lucide-react";
import { ThemeToggle } from "../client/layout";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/files/upload", label: "Upload files", icon: Upload },
  { href: "/admin/resources", label: "Resources", icon: BookOpen },
  { href: "/admin/audit", label: "Audit log", icon: ShieldCheck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

interface Stats {
  pendingClients: number;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, signout, refreshMe } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    if (!user) refreshMe();
  }, [user, refreshMe]);

  // Poll pending-count every 60s so the sidebar badge stays fresh.
  const statsQ = useQuery<Stats>({
    queryKey: ["/api/admin/stats"],
    enabled: user?.role === "admin",
    refetchInterval: 60_000,
  });
  const pending = statsQ.data?.pendingClients ?? 0;

  if (user?.mustChangePassword && location !== "/admin/settings") {
    return <Redirect to="/admin/settings" />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <Logo variant="light" />
          <div className="mt-2 inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[hsl(42_90%_40%)] text-primary">Admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => {
            const active = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            const Icon = item.icon;
            const showBadge = item.href === "/admin/clients" && pending > 0;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover-elevate ${active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80"}`}
                  data-testid={`link-admin-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span
                      className="min-w-[20px] h-5 px-1.5 rounded-full bg-[hsl(42_90%_40%)] text-primary text-[11px] font-semibold flex items-center justify-center"
                      data-testid="badge-pending-count"
                    >
                      {pending}
                    </span>
                  )}
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
            data-testid="button-admin-signout"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

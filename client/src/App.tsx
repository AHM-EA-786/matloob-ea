import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { ReactNode, useEffect, useState } from "react";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import SignIn from "@/pages/signin";
import SignUp from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import ClientLayout from "@/pages/client/layout";
import ClientDashboard from "@/pages/client/dashboard";
import ClientFiles from "@/pages/client/files";
import ClientResources from "@/pages/client/resources";
import ClientProfile from "@/pages/client/profile";
import ClientMessages from "@/pages/client/messages";
import AdminLayout from "@/pages/admin/layout";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminClients from "@/pages/admin/clients";
import AdminClientDetail from "@/pages/admin/client-detail";
import AdminFilesUpload from "@/pages/admin/files-upload";
import AdminResources from "@/pages/admin/resources";
import AdminAudit from "@/pages/admin/audit";
import AdminSettings from "@/pages/admin/settings";

function RequireRole({ role, children }: { role: "client" | "admin"; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Redirect to="/signin" />;
  if (user.role !== role) return <Redirect to={user.role === "admin" ? "/admin" : "/client"} />;
  return <>{children}</>;
}

function ThemeInit() {
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (initialized) return;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
    setInitialized(true);
  }, [initialized]);
  return null;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/signin" component={SignIn} />
      <Route path="/signup" component={SignUp} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />

      <Route path="/client">
        <RequireRole role="client"><ClientLayout><ClientDashboard /></ClientLayout></RequireRole>
      </Route>
      <Route path="/client/files">
        <RequireRole role="client"><ClientLayout><ClientFiles /></ClientLayout></RequireRole>
      </Route>
      <Route path="/client/resources">
        <RequireRole role="client"><ClientLayout><ClientResources /></ClientLayout></RequireRole>
      </Route>
      <Route path="/client/profile">
        <RequireRole role="client"><ClientLayout><ClientProfile /></ClientLayout></RequireRole>
      </Route>
      <Route path="/client/messages">
        <RequireRole role="client"><ClientLayout><ClientMessages /></ClientLayout></RequireRole>
      </Route>

      <Route path="/admin">
        <RequireRole role="admin"><AdminLayout><AdminDashboard /></AdminLayout></RequireRole>
      </Route>
      <Route path="/admin/clients">
        <RequireRole role="admin"><AdminLayout><AdminClients /></AdminLayout></RequireRole>
      </Route>
      <Route path="/admin/clients/:id">
        {(params) => (
          <RequireRole role="admin">
            <AdminLayout><AdminClientDetail id={Number(params.id)} /></AdminLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/admin/files/upload">
        <RequireRole role="admin"><AdminLayout><AdminFilesUpload /></AdminLayout></RequireRole>
      </Route>
      <Route path="/admin/resources">
        <RequireRole role="admin"><AdminLayout><AdminResources /></AdminLayout></RequireRole>
      </Route>
      <Route path="/admin/audit">
        <RequireRole role="admin"><AdminLayout><AdminAudit /></AdminLayout></RequireRole>
      </Route>
      <Route path="/admin/settings">
        <RequireRole role="admin"><AdminLayout><AdminSettings /></AdminLayout></RequireRole>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeInit />
        <Toaster />
        <Router hook={useHashLocation}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

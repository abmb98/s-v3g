import "./global.css";

import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { LoginForm } from "@/components/LoginForm";
import { UserSetupDialog } from "@/components/UserSetupDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { FirebaseStatus } from "@/components/FirebaseStatus";
import { NetworkStatus } from "@/components/NetworkStatus";
import { FirebaseErrorBoundary } from "@/components/FirebaseErrorBoundary";

import Dashboard from "./pages/Dashboard";
import Workers from "./pages/Workers";
import Rooms from "./pages/Rooms";
import Fermes from "./pages/Fermes";
import Statistics from "./pages/Statistics";
import AdminTools from "./pages/AdminTools";
import SuperAdminSetup from "./pages/SuperAdminSetup";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const [showSetup, setShowSetup] = useState(false);
  const [showFirebaseStatus, setShowFirebaseStatus] = useState(false);

  useEffect(() => {
    // Show setup dialog if user is authenticated but profile is incomplete
    if (isAuthenticated && user) {
      const isIncomplete = !user.nom || user.nom === 'Utilisateur' || !user.telephone;
      setShowSetup(isIncomplete);
    }
  }, [isAuthenticated, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <LoginForm />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Layout>
        {showFirebaseStatus && (
          <div className="mb-4">
            <FirebaseStatus onRetry={() => setShowFirebaseStatus(false)} />
          </div>
        )}
        {children}
        <UserSetupDialog
          open={showSetup}
          onClose={() => setShowSetup(false)}
        />
      </Layout>
    </ErrorBoundary>
  );
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/fermes" element={
        <ProtectedRoute>
          <Fermes />
        </ProtectedRoute>
      } />
      <Route path="/ouvriers" element={
        <ProtectedRoute>
          <Workers />
        </ProtectedRoute>
      } />
      <Route path="/chambres" element={
        <ProtectedRoute>
          <Rooms />
        </ProtectedRoute>
      } />
      <Route path="/statistiques" element={
        <ProtectedRoute>
          <Statistics />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute>
          <AdminTools />
        </ProtectedRoute>
      } />
      <Route path="/admin-tools" element={
        <ProtectedRoute>
          <AdminTools />
        </ProtectedRoute>
      } />
      <Route path="/super-admin-setup" element={<SuperAdminSetup />} />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />
      <Route path="/parametres" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NetworkStatus />
        <FirebaseErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </FirebaseErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")!).render(<App />);

import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from './components/Layout';
// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// App pages
import Home from '@/pages/Home';
import NewTicket from '@/pages/NewTicket';
import TicketDetail from '@/pages/TicketDetail';
import Garage from '@/pages/Garage';
import Codes from '@/pages/Codes';
import Scan from '@/pages/Scan';
import PreShift from '@/pages/PreShift';
import Subscribe from '@/pages/Subscribe';
import ApiKeys from '@/pages/ApiKeys';
import Fleet from '@/pages/Fleet';
import { initFleetPush } from '@/lib/fleetPush';
import FleetLive from '@/pages/FleetLive';
import FleetDashboard from '@/pages/FleetDashboard';
import ServiceScheduler from '@/pages/ServiceScheduler';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-zinc-800 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewTicket />} />
          <Route path="/ticket/:id" element={<TicketDetail />} />
          <Route path="/garage" element={<Garage />} />
          <Route path="/codes" element={<Codes />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/pre-shift" element={<PreShift />} />
          <Route path="/subscribe" element={<Subscribe />} />
          <Route path="/fleet" element={<Fleet />} />
          <Route path="/fleet-live" element={<FleetLive />} />
          <Route path="/fleet-dashboard" element={<FleetDashboard />} />
          <Route path="/service-scheduler" element={<ServiceScheduler />} />
          <Route path="/settings" element={<ApiKeys />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

// Opens Fleet Live when a fleet push notification is tapped —
// mounted inside the Router so it can navigate from any page.
function FleetPushTapHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    initFleetPush({ onOpenFleet: () => navigate('/fleet-live') });
  }, [navigate]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <FleetPushTapHandler />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App

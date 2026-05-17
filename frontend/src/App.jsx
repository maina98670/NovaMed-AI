import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLang } from './context/LanguageContext';
import ErrorBoundary from './components/ErrorBoundary';

import Splash from './pages/Splash';
import LanguageSelect from './pages/LanguageSelect';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import PatientList from './pages/PatientList';
import PatientNew from './pages/PatientNew';
import PatientDetail from './pages/PatientDetail';
import EncounterPage from './pages/EncounterPage';
import SessionEnd from './pages/SessionEnd';
import AdminPage from './pages/AdminPage';
import EpiSQLExporter from './pages/EpiSQLExporter';
import GoogleCallback from './pages/GoogleCallback';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const { lang } = useLang();
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><span className="spinner" /></div>;
  if (!lang) return <Navigate to="/select-language" replace />;
  if (!user) return <Navigate to="/login" replace />;
  // Admins are confined to /admin — no clinical UI
  if (user.role === 'admin' && !window.location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function AdminOnly({ children }) {
  const { user, loading } = useAuth();
  const { lang } = useLang();
  if (loading) return null;
  if (!lang) return <Navigate to="/select-language" replace />;
  // AdminPage handles its own login screen — just render it
  return children;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"                  element={<Splash />} />
            <Route path="/select-language"   element={<LanguageSelect />} />
            <Route path="/login"             element={<Login />} />
            <Route path="/register"          element={<Register />} />
            <Route path="/reset-password"    element={<ResetPassword />} />
            <Route path="/admin" element={
              <AdminOnly>
                <ErrorBoundary label="Admin console">
                  <AdminPage />
                </ErrorBoundary>
              </AdminOnly>
            } />
            <Route path="/admin/epi-export" element={
              <AdminOnly>
                <ErrorBoundary label="Epi SQL exporter">
                  <EpiSQLExporter />
                </ErrorBoundary>
              </AdminOnly>
            } />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/dashboard"        element={<ErrorBoundary label="Dashboard"><Dashboard /></ErrorBoundary>} />
              <Route path="/patients"         element={<ErrorBoundary label="Patient list"><PatientList /></ErrorBoundary>} />
              <Route path="/patients/new"     element={<ErrorBoundary label="New patient"><PatientNew /></ErrorBoundary>} />
              <Route path="/patients/:id"     element={<ErrorBoundary label="Patient detail"><PatientDetail /></ErrorBoundary>} />
              <Route path="/encounters/:id"   element={<ErrorBoundary label="Encounter"><EncounterPage /></ErrorBoundary>} />
              <Route path="/session-end/:id?" element={<ErrorBoundary label="Session end"><SessionEnd /></ErrorBoundary>} />
            </Route>
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

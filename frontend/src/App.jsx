import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VoterList from './pages/VoterList.jsx';
import AssemblyList from './pages/AssemblyList.jsx';
import AssemblyDetail from './pages/AssemblyDetail.jsx';
import BoothList from './pages/BoothList.jsx';
import MlaList from './pages/MlaList.jsx';
import MlaImages from './pages/MlaImages.jsx';
import BoothLogins from './pages/BoothLogins.jsx';
import WardLogins from './pages/WardLogins.jsx';
import CreateWardLogin from './pages/CreateWardLogin.jsx';
import WardDetail from './pages/WardDetail.jsx';
import EditWardBooths from './pages/EditWardBooths.jsx';
import AssemblyAnalytics from './pages/AssemblyAnalytics.jsx';
import HtmlReport from './pages/HtmlReport.jsx';
import BoothReport from './pages/BoothReport.jsx';
import PerformanceReport from './pages/PerformanceReport.jsx';
import WardHome from './pages/WardHome.jsx';
import SocialMedia from './pages/SocialMedia.jsx';
import SocialMediaReports from './pages/SocialMediaReports.jsx';
import Registrations from './pages/Registrations.jsx';
import RegistrationDetail from './pages/RegistrationDetail.jsx';
import RegistrationEdit from './pages/RegistrationEdit.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import FlowImages from './pages/FlowImages.jsx';
import CrmInbox from './pages/CrmInbox.jsx';
import Faq from './pages/Faq.jsx';
import TeamManagement from './pages/TeamManagement.jsx';
import TeamDashboard from './pages/TeamDashboard.jsx';
import TeamReports from './pages/TeamReports.jsx';

// Helper to determine home path for any user based on their group/role.
function getHomePath(user) {
  if (!user) return '/register';
  const groupId = Number(user.group_id || user.user_group_id || 1);
  if (user.home) return user.home;
  if (groupId === 12) return '/team/dashboard';
  if (groupId === 6) return '/ward/dashboard';
  if (groupId === 3) return '/assembly-details';
  if (groupId === 4 || groupId === 11) return '/booth/dashboard';
  return '/dashboard';
}

// Redirect unauthenticated users to the login/register page.
function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/register" replace />;
}

// Guard routes strictly based on allowed user groups/roles.
function RequireRole({ allowedGroups, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/register" replace />;

  const groupId = Number(user.group_id || user.user_group_id || 1);

  // Super Admin (Group 1) has full access to all pages
  if (groupId === 1) return children;

  if (allowedGroups && allowedGroups.includes(groupId)) {
    return children;
  }

  // Unauthorized for this route -> redirect to role home
  return <Navigate to={getHomePath(user)} replace />;
}

// Redirect already-authenticated users away from login/register pages.
function PublicOnly({ children }) {
  const { user } = useAuth();
  if (!user) return children;
  return <Navigate to={getHomePath(user)} replace />;
}

// Redirect index / or unknown paths to user's role home page.
function IndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={getHomePath(user)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/crm" element={<RequireRole allowedGroups={[1, 12]}><CrmInbox /></RequireRole>} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<IndexRedirect />} />

        {/* Super Admin Only Routes (Group 1) */}
        <Route path="dashboard" element={<RequireRole allowedGroups={[1]}><Dashboard /></RequireRole>} />
        <Route path="assemblies" element={<RequireRole allowedGroups={[1]}><AssemblyList /></RequireRole>} />
        <Route path="assemblies/:no" element={<RequireRole allowedGroups={[1]}><AssemblyDetail /></RequireRole>} />
        <Route path="mla-list" element={<RequireRole allowedGroups={[1]}><MlaList /></RequireRole>} />
        <Route path="mla-images" element={<RequireRole allowedGroups={[1]}><MlaImages /></RequireRole>} />
        <Route path="booth-logins" element={<RequireRole allowedGroups={[1]}><BoothLogins /></RequireRole>} />
        <Route path="booths" element={<RequireRole allowedGroups={[1]}><BoothList /></RequireRole>} />
        <Route path="ward-logins" element={<RequireRole allowedGroups={[1]}><WardLogins /></RequireRole>} />
        <Route path="ward-logins/create" element={<RequireRole allowedGroups={[1]}><CreateWardLogin /></RequireRole>} />
        <Route path="ward-logins/:id" element={<RequireRole allowedGroups={[1]}><WardDetail /></RequireRole>} />
        <Route path="ward-logins/:id/edit" element={<RequireRole allowedGroups={[1]}><EditWardBooths /></RequireRole>} />
        <Route path="registrations" element={<RequireRole allowedGroups={[1]}><Registrations /></RequireRole>} />
        <Route path="registrations/view/:id" element={<RequireRole allowedGroups={[1]}><RegistrationDetail /></RequireRole>} />
        <Route path="registrations/edit/:id" element={<RequireRole allowedGroups={[1]}><RegistrationEdit /></RequireRole>} />
        <Route path="payments" element={<RequireRole allowedGroups={[1]}><Subscriptions /></RequireRole>} />
        <Route path="team" element={<RequireRole allowedGroups={[1]}><TeamManagement /></RequireRole>} />

        {/* CRM Team Member Dashboard & Reports (Group 12 & Admin) */}
        <Route path="team/dashboard" element={<RequireRole allowedGroups={[1, 12]}><TeamDashboard /></RequireRole>} />
        <Route path="team/reports" element={<RequireRole allowedGroups={[1, 12]}><TeamReports /></RequireRole>} />
        <Route path="flow-images" element={<RequireRole allowedGroups={[1]}><FlowImages /></RequireRole>} />

        {/* MLA / Assembly Routes (Group 3 & Admin) */}
        <Route path="assembly-details" element={<RequireRole allowedGroups={[1, 3]}><AssemblyAnalytics /></RequireRole>} />
        <Route path="assembly-analytics" element={<RequireRole allowedGroups={[1, 3]}><AssemblyAnalytics /></RequireRole>} />
        <Route path="candidate-briefing" element={<RequireRole allowedGroups={[1, 3]}><HtmlReport docKey="candidate-briefing" title="Candidate Briefing" /></RequireRole>} />
        <Route path="field-operations" element={<RequireRole allowedGroups={[1, 3]}><HtmlReport docKey="field-operations" title="Field Operations Manual" /></RequireRole>} />
        <Route path="booth-report" element={<RequireRole allowedGroups={[1, 3]}><BoothReport /></RequireRole>} />

        {/* Booth Agent Routes (Group 4, 11 & Admin) */}
        <Route path="booth/dashboard" element={<RequireRole allowedGroups={[1, 4, 11]}><AssemblyAnalytics /></RequireRole>} />
        <Route path="performance-report" element={<RequireRole allowedGroups={[1, 4, 11]}><PerformanceReport /></RequireRole>} />

        {/* Ward & Candidate Social Media Routes */}
        <Route path="ward/dashboard" element={<RequireRole allowedGroups={[1, 6]}><WardHome /></RequireRole>} />
        <Route path="ward/social-media" element={<RequireRole allowedGroups={[1, 4, 6, 11]}><SocialMedia /></RequireRole>} />
        <Route path="ward/social-media-reports" element={<RequireRole allowedGroups={[1, 4, 6, 11]}><SocialMediaReports /></RequireRole>} />

        {/* Shared Voters List Route (Accessible to all logged-in roles) */}
        <Route path="voters" element={<RequireRole allowedGroups={[1, 2, 3, 4, 6, 7, 8, 9, 10, 11]}><VoterList /></RequireRole>} />

        <Route path="*" element={<IndexRedirect />} />
      </Route>
      <Route path="*" element={<IndexRedirect />} />
    </Routes>
  );
}

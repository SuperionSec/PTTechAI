import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LoginPage from './pages/LoginPage'
// import RegisterPage from './pages/RegisterPage'  // Disabled: user creation is admin-only
import HomePage from './pages/HomePage'
import NewScanPage from './pages/NewScanPage'
import ScanDetailsPage from './pages/ScanDetailsPage'
import AgentStatusPage from './pages/AgentStatusPage'
import TaskLibraryPage from './pages/TaskLibraryPage'
import RealtimeTaskPage from './pages/RealtimeTaskPage'
import ReportsPage from './pages/ReportsPage'
import ReportViewPage from './pages/ReportViewPage'
import SettingsPage from './pages/SettingsPage'
import SchedulerPage from './pages/SchedulerPage'
import AutoPentestPage from './pages/AutoPentestPage'
import VulnLabPage from './pages/VulnLabPage'
import TerminalAgentPage from './pages/TerminalAgentPage'
import SandboxDashboardPage from './pages/SandboxDashboardPage'
import KnowledgePage from './pages/KnowledgePage'
import MCPManagementPage from './pages/MCPManagementPage'
import ProvidersPage from './pages/ProvidersPage'
import FullIATestingPage from './pages/FullIATestingPage'
import UserManagementPage from './pages/UserManagementPage'
import UserProfilePage from './pages/UserProfilePage'
import LanguagesPage from './pages/LanguagesPage'
import RoleManagementPage from './pages/RoleManagementPage'
import UnmappedResourcesPage from './pages/UnmappedResourcesPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* <Route path="/register" element={<RegisterPage />} />  // Disabled: user creation is admin-only */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/auto" element={<ProtectedRoute><AutoPentestPage /></ProtectedRoute>} />
        <Route path="/full-ia" element={<ProtectedRoute><FullIATestingPage /></ProtectedRoute>} />
        <Route path="/vuln-lab" element={<ProtectedRoute><VulnLabPage /></ProtectedRoute>} />
        <Route path="/terminal" element={<ProtectedRoute><TerminalAgentPage /></ProtectedRoute>} />
        <Route path="/scan/new" element={<ProtectedRoute><NewScanPage /></ProtectedRoute>} />
        <Route path="/scan/:scanId" element={<ProtectedRoute><ScanDetailsPage /></ProtectedRoute>} />
        <Route path="/agent/:agentId" element={<ProtectedRoute><AgentStatusPage /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TaskLibraryPage /></ProtectedRoute>} />
        <Route path="/realtime" element={<ProtectedRoute><RealtimeTaskPage /></ProtectedRoute>} />
        <Route path="/knowledge" element={<ProtectedRoute><KnowledgePage /></ProtectedRoute>} />
        <Route path="/mcp" element={<ProtectedRoute><MCPManagementPage /></ProtectedRoute>} />
        <Route path="/scheduler" element={<ProtectedRoute><SchedulerPage /></ProtectedRoute>} />
        <Route path="/sandboxes" element={<ProtectedRoute><SandboxDashboardPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
        <Route path="/reports/:reportId" element={<ProtectedRoute><ReportViewPage /></ProtectedRoute>} />
        <Route path="/providers" element={<ProtectedRoute><ProvidersPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
        <Route path="/languages" element={<ProtectedRoute><LanguagesPage /></ProtectedRoute>} />
        <Route path="/roles" element={<ProtectedRoute><RoleManagementPage /></ProtectedRoute>} />
        <Route path="/unmapped-resources" element={<ProtectedRoute><UnmappedResourcesPage /></ProtectedRoute>} />
      </Routes>
    </Layout>
  )
}

export default App

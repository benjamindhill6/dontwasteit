import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Offers from './pages/Offers'
import NewPost from './pages/NewPost'
import Activity from './pages/Activity'
import Profile from './pages/Profile'
import Admin from './pages/Admin'

const Logo = () => <span className="logo" aria-hidden>📦</span>

export default function App() {
  const { session, me, org, loading } = useAuth()

  if (!configured) {
    return (
      <div className="center-page">
        <h1>Almost there</h1>
        <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this site, then redeploy.</p>
      </div>
    )
  }
  if (loading) return <div className="center-page"><Logo /><p>Loading…</p></div>

  if (!session) {
    return (
      <Routes>
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/" element={<Login />} />
        {/* Always sign in from "/" so a fresh login lands on the default page (Offers), not a stale deep link. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }
  if (!me || !me.active) {
    return (
      <div className="center-page">
        <Logo />
        <h1>No access yet</h1>
        <p>This account hasn't been approved. Ask a network admin to invite you.</p>
        <SignOut />
      </div>
    )
  }

  const isAdmin = me.is_platform_admin
  const isPantry = org?.type === 'pantry'
  const canPost = Boolean(org)

  return (
    <div className="shell">
      <main className="main">
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          {isPantry && <Route path="/offers" element={<Offers />} />}
          {canPost && <Route path="/post" element={<NewPost />} />}
          {canPost && <Route path="/activity" element={<Activity />} />}
          <Route path="/profile" element={<Profile />} />
          {isAdmin && <Route path="/admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to={isPantry ? '/offers' : isAdmin ? '/admin' : '/post'} replace />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Main">
        {isPantry && <Tab to="/offers" icon="🥕" label="Offers" />}
        {canPost && <Tab to="/post" icon="➕" label="Post" />}
        {canPost && <Tab to="/activity" icon="📋" label="Activity" />}
        {isAdmin && <Tab to="/admin" icon="🛠️" label="Admin" />}
        <Tab to="/profile" icon="👤" label="Profile" />
      </nav>
    </div>
  )
}

const Tab = ({ to, icon, label }: { to: string; icon: string; label: string }) => (
  <NavLink to={to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
    <span className="tab-icon" aria-hidden>{icon}</span>
    <span>{label}</span>
  </NavLink>
)

function SignOut() {
  const { signOut } = useAuth()
  return <button className="btn secondary" onClick={signOut}>Sign out</button>
}

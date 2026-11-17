import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Offers from './pages/Offers'
import NewPost from './pages/NewPost'
import Activity from './pages/Activity'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Alerts, { MyAlertLimits, PantryAlertRules } from './pages/Alerts'
import { syncPush } from './lib/push'

// True once this app launch has been sent to its default page. A page reload (or reopening the
// installed app) starts a new launch, so the flag resets and we redirect again.
let launchHandled = false

/** On each launch, jump to the default page even if the app reopened on a stale URL such as /profile. */
function LaunchRedirect({ to }: { to: string }) {
  const { pathname, search } = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    if (launchHandled) return
    launchHandled = true
    // Tapping an alert opens the page it points to, so leave those alone.
    if (new URLSearchParams(search).get('from') === 'alert') return
    if (pathname !== to && pathname !== '/set-password') nav(to, { replace: true })
  }, [pathname, search, to, nav])
  return null
}

const Logo = () => <span className="logo" aria-hidden>📦</span>

export default function App() {
  const { session, me, org, loading } = useAuth()
  // Keep this phone's alerts pointed at whoever is signed in.
  useEffect(() => { if (me?.active) syncPush() }, [me?.id, me?.active])

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
  const landing = isPantry ? '/offers' : isAdmin ? '/admin' : '/post'

  return (
    <div className="shell">
      <LaunchRedirect to={landing} />
      <main className="main">
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          {isPantry && <Route path="/offers" element={<Offers />} />}
          {canPost && <Route path="/post" element={<NewPost />} />}
          {canPost && <Route path="/activity" element={<Activity />} />}
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/alerts" element={<Alerts />} />
          {isPantry && <Route path="/profile/alerts/mine" element={<MyAlertLimits />} />}
          {isPantry && <Route path="/profile/alerts/pantry" element={<PantryAlertRules />} />}
          {isAdmin && <Route path="/admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to={landing} replace />} />
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

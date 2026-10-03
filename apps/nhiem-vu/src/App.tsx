import { Toaster } from 'sonner'
import { LoginScreen } from '@/components/app/LoginScreen'
import { BootScreen, PendingScreen, ProfileErrorScreen } from '@/components/app/StatusScreens'
import { TooltipProvider } from '@/components/ui/overlays'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { isApproved } from '@/lib/roles'
import { TasksPage } from '@/pages/TasksPage'

function Gate() {
  const { status, profile, profileError } = useAuth()
  if (status === 'loading') return <BootScreen />
  if (status === 'signed-out') return <LoginScreen />
  if (profileError) return <ProfileErrorScreen message={profileError} />
  if (!profile || !isApproved(profile)) return <PendingScreen />
  return <TasksPage profile={profile} />
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={300}>
        <Gate />
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </AuthProvider>
  )
}

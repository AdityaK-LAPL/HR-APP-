import { useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/feedback/ErrorState'

/** Router `errorElement`: a render/loader error anywhere below never white-screens the app. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (import.meta.env.DEV) console.error(error)
  return (
    <div className="center-screen">
      <ErrorState error={error} />
      <Button variant="outline" onClick={() => window.location.assign('/')}>
        Reload the app
      </Button>
    </div>
  )
}

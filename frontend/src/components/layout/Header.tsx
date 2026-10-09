import { useMatches } from 'react-router-dom'
import type { RouteHandle } from '@/app/route-config'
import { UserMenu } from './UserMenu'

export function Header() {
  const matches = useMatches()
  const handle = [...matches].reverse().find((match) => match.handle)?.handle as
    | RouteHandle
    | undefined
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <img src="/pwa-icon.svg" alt="" width={30} height={30} />
        <p className="app-header-title">{handle?.title ?? 'OpsFlow'}</p>
      </div>
      <UserMenu />
    </header>
  )
}

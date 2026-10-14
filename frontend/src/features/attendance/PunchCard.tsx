import { Clock, LogIn, LogOut, MapPin } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Section } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { formatDate, formatDuration, formatTime } from '@/lib/dates'
import { describeLocationFailure, getCurrentLocation, type Coordinates } from '@/lib/geolocation'
import { ATTENDANCE_STATUS, WORK_MODE, WORK_MODE_SHORT, type WorkMode } from '@/lib/labels'
import { usePunch, useTodayAttendance } from './queries'
import { rememberedWorkMode, rememberWorkMode } from './workMode'

/** Today's attendance with punch in / out. The location is read only at the moment of the punch. */
export function PunchCard() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const toast = useToast()
  const query = useTodayAttendance(user?.id, today)
  const punchIn = usePunch('in')
  const punchOut = usePunch('out')
  const [withLocation, setWithLocation] = useState(true)
  const [workMode, setWorkMode] = useState<WorkMode>(rememberedWorkMode)
  const [remark, setRemark] = useState('')
  const [locating, setLocating] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const day = query.data ?? null
  const state: 'loading' | 'not-in' | 'working' | 'done' = query.isPending
    ? 'loading'
    : !day || !day.punch_in_time
      ? 'not-in'
      : day.punch_out_time
        ? 'done'
        : 'working'
  const busy = locating || punchIn.isPending || punchOut.isPending

  const run = async (kind: 'in' | 'out') => {
    setError(null)
    let coordinates: Coordinates | null = null
    if (withLocation) {
      setLocating(true)
      const result = await getCurrentLocation()
      setLocating(false)
      if (result.ok) coordinates = result.coordinates
      else toast.info(describeLocationFailure(result.reason), 'Location not recorded')
    }
    const mutation = kind === 'in' ? punchIn : punchOut
    if (kind === 'in') rememberWorkMode(workMode)
    mutation.mutate(kind === 'in' ? { coordinates, workMode, remark } : { coordinates }, {
      onSuccess: () => toast.success(kind === 'in' ? 'You are punched in.' : 'You are punched out. Good work today!'),
      onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not record the punch.'),
      onSettled: () => setConfirmOut(false),
    })
  }

  return (
    <Section title="Today">
      <div className="stack">
        <p className="meta-line">
          <Clock size={14} aria-hidden="true" /> {formatDate(today)}
          {day && <StatusBadge table={ATTENDANCE_STATUS} value={day.status} />}
        </p>

        {state === 'loading' && <Skeleton height={48} />}
        {query.isError && <Alert tone="error">Could not load today&apos;s attendance. {query.error.message}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        {state === 'not-in' && <p style={{ fontSize: 15 }}>You haven&apos;t punched in yet today.</p>}
        {state === 'working' && day && (
          <p style={{ fontSize: 15 }}>
            Punched in at <strong>{formatTime(day.punch_in_time)}</strong>. Don&apos;t forget to punch out.
            {day.work_mode && <> Working: <strong>{WORK_MODE[day.work_mode]}</strong>{day.remark ? ` - ${day.remark}` : ''}.</>}
          </p>
        )}
        {state === 'done' && day && (
          <p style={{ fontSize: 15 }}>
            Day complete: in <strong>{formatTime(day.punch_in_time)}</strong>, out{' '}
            <strong>{formatTime(day.punch_out_time)}</strong>
            {day.total_duration_minutes !== null && <> · {formatDuration(day.total_duration_minutes)} worked</>}.
            {day.work_mode && <> Worked: {WORK_MODE_SHORT[day.work_mode].toLowerCase()}{day.remark ? ` - ${day.remark}` : ''}.</>}
          </p>
        )}

        {state === 'not-in' && (
          <>
            <SegmentedControl<WorkMode>
              label="Where are you working today?"
              value={workMode}
              onChange={setWorkMode}
              options={[
                { value: 'at_office', label: WORK_MODE_SHORT.at_office },
                { value: 'work_from_home', label: WORK_MODE_SHORT.work_from_home },
                { value: 'on_duty', label: WORK_MODE_SHORT.on_duty },
              ]}
            />
            <p className="field-hint">
              <strong>On duty</strong> = at a customer&apos;s site or travelling for work. {workMode === 'on_duty' ? 'Say where, so it shows on your report.' : ''}
            </p>
            {workMode === 'on_duty' && (
              <Input
                label="Where? (customer or place)"
                value={remark}
                maxLength={200}
                placeholder="e.g. KSB Coimbatore"
                onChange={(event) => setRemark(event.target.value)}
              />
            )}
          </>
        )}
        {(state === 'not-in' || state === 'working') && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={withLocation}
                onChange={(event) => setWithLocation(event.target.checked)}
                disabled={busy}
              />
              <span>
                <MapPin size={14} aria-hidden="true" /> Record my location with this punch
                <small>Your browser will ask permission. It is read once, only now.</small>
              </span>
            </label>
            {state === 'not-in' ? (
              <Button size="lg" icon={<LogIn size={18} />} loading={busy} onClick={() => void run('in')}>
                {locating ? 'Finding location…' : 'Punch in'}
              </Button>
            ) : (
              <Button size="lg" variant="danger" icon={<LogOut size={18} />} loading={busy} onClick={() => setConfirmOut(true)}>
                Punch out
              </Button>
            )}
          </>
        )}
        {state === 'done' && <p style={{ fontSize: 13 }}>Attendance for today is complete; it can&apos;t be punched again.</p>}
      </div>

      <ConfirmDialog
        open={confirmOut}
        title="Punch out for today?"
        message="This ends your working day. You won't be able to punch in again today."
        confirmLabel="Punch out"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => void run('out')}
      />
    </Section>
  )
}

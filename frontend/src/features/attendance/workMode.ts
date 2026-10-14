import type { WorkMode } from '@/lib/labels'

const KEY = 'opsflow.work-mode'
const MODES: readonly WorkMode[] = ['at_office', 'work_from_home', 'on_duty']

/** The way of working the person chose last time - a convenience only, never a decision for them. */
export function rememberedWorkMode(): WorkMode {
  try {
    const value = localStorage.getItem(KEY)
    return MODES.find((mode) => mode === value) ?? 'at_office'
  } catch {
    return 'at_office'
  }
}

export function rememberWorkMode(mode: WorkMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* storage blocked: the choice is simply not remembered */
  }
}

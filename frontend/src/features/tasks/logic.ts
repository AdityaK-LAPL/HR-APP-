import type { Task } from './queries'

/** Presentation-only: a task whose due date has passed and which is not finished. */
export function isOverdue(task: Pick<Task, 'due_date' | 'status'>, today: string): boolean {
  return Boolean(task.due_date) && task.due_date! < today && task.status !== 'completed' && task.status !== 'cancelled'
}

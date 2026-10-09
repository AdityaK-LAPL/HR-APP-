/** Friendly aliases over the generated OpenAPI types (`npm run gen:api`). Never hand-write API shapes. */

import type { components } from './schema'

export type Schema<K extends keyof components['schemas']> = components['schemas'][K]

export type UserProfile = Schema<'UserProfile'>
export type UserDirectoryEntry = Schema<'UserDirectoryEntry'>
export type MyPermissions = Schema<'MyPermissionsResponse'>
export type AppConfig = Schema<'AppConfigResponse'>
export type Role = UserProfile['role']

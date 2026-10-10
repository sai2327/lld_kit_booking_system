/**
 * Role Display Utilities
 *
 * The database stores two roles: COORDINATOR and CLUB_MEMBER.
 * The application presents exactly two roles to users: ADMIN and USER.
 *
 *   COORDINATOR → ADMIN
 *   CLUB_MEMBER  → USER
 *
 * These functions provide a single source of truth for all display-layer role mapping.
 * Authentication and authorization still use the database enum values.
 */

export type AppRole = 'ADMIN' | 'USER' | 'COORDINATOR' | 'CLUB_MEMBER';

export function isAdmin(role: AppRole | string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'COORDINATOR';
}

export function isUser(role: AppRole | string | undefined | null): boolean {
  return role === 'USER' || role === 'CLUB_MEMBER';
}

export function getDisplayRole(role: AppRole | string | undefined | null): 'ADMIN' | 'USER' {
  return isAdmin(role) ? 'ADMIN' : 'USER';
}

export function getDisplayRoleLabel(role: AppRole | string | undefined | null): string {
  return isAdmin(role) ? 'Admin (Coordinator)' : 'User (Club Lead)';
}

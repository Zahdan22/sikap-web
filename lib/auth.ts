// lib/auth.ts
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@sikap.internal`
}
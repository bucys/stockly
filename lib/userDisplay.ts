import type { UserProfile } from '@/services/profiles';

export function displayUser(
  userId: string | null | undefined,
  profilesByUserId: Map<string, UserProfile>,
  currentUserId: string | null,
): string {
  if (!userId) return 'Team member';
  if (currentUserId && userId === currentUserId) return 'You';
  const p = profilesByUserId.get(userId);
  if (p?.display_name && p.display_name.trim() !== '') return p.display_name;
  if (p?.email && p.email.trim() !== '') return p.email;
  return 'Team member';
}

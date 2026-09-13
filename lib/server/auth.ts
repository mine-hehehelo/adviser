import { HttpError } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function getSignedInUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, 'You must sign in');
  }

  return user;
}

export async function requireAllowedUser() {
  const user = await getSignedInUser();
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, display_name, role, is_allowed')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    throw new HttpError(403, 'User profile is unavailable');
  }

  if (!profile.is_allowed) {
    throw new HttpError(403, 'Your account does not have application access');
  }

  return {
    user,
    profile,
  };
}

export async function requireAdmin() {
  const result = await requireAllowedUser();

  if (result.profile.role !== 'admin') {
    throw new HttpError(403, 'Administrator access is required');
  }

  return result;
}
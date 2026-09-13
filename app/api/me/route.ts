import { getSignedInUser } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const user = await getSignedInUser();
    const admin = createAdminClient();

    const { data: profile, error } = await admin
      .from('profiles')
      .select('email, display_name, role, is_allowed')
      .eq('id', user.id)
      .single();

    if (error) {
      throw error;
    }

    return Response.json({
      userId: user.id,
      email: user.email,
      profile,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
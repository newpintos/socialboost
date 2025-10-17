import { getSupabaseServerClient, getSupabaseServiceRoleClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('uid')
      .eq('uid', user.id)
      .single();

    if (existingProfile) {
      return NextResponse.json({ message: 'Profile already exists' });
    }

    // Create profile using service role client
    const supabaseAdmin = getSupabaseServiceRoleClient();
    const { error: insertError } = await supabaseAdmin.from('profiles').insert({
      uid: user.id,
      email: user.email || '',
      plan: 'free',
      credits: 50,
    });

    if (insertError) {
      console.error('Failed to create profile:', insertError);
      return NextResponse.json(
        { error: 'Failed to create profile', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Profile created successfully' });
  } catch (error: any) {
    console.error('Profile ensure error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

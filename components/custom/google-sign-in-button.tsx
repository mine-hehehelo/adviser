"use client"

import { createClient } from "@/lib/supabase/client"

export function GoogleSignInButton() {
  async function signInWithGoogle() {
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error("Google sign-in failed:", error.message)
    }
  }

  return (
    <button type="button" onClick={signInWithGoogle}>
      Continue with Google
    </button>
  )
}
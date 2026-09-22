import Link from 'next/link';

export const metadata = { title: 'Sign-in error | DeInfluenceMe' };

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Sign-in did not finish</h1>
      <p className="text-muted-foreground">
        Please return to the login page and try again. If the problem continues,
        ask the project administrator to check the sign-in configuration.
      </p>
      <Link className="underline" href="/login">
        Return to login
      </Link>
    </main>
  );
}

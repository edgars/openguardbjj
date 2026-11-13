import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '../../auth-shell';

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn />
    </AuthShell>
  );
}

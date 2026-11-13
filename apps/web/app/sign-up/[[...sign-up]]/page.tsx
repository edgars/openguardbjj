import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '../../auth-shell';

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp />
    </AuthShell>
  );
}

import { SignUp } from '@clerk/nextjs';
import ForceDarkMode from '@/components/ForceDarkMode';

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <ForceDarkMode />
      <SignUp />
    </div>
  );
}

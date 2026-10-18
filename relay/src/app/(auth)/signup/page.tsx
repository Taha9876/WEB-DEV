import { AuthForm } from "@/components/auth/auth-form";
import { signup } from "../actions";

export const metadata = { title: "Create workspace" };

export default function SignupPage() {
  return (
    <AuthForm mode="signup" action={signup} fields={[
      { name: "workspaceName", label: "Company name", autoComplete: "organization", placeholder: "Sunrise Solar" },
      { name: "name", label: "Your name", autoComplete: "name", placeholder: "Taha Ahmed" },
      { name: "email", label: "Work email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
      { name: "password", label: "Password", type: "password", autoComplete: "new-password", placeholder: "At least 10 characters" },
    ]} />
  );
}

import { AuthForm } from "@/components/auth/auth-form";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthForm mode="login" action={login} fields={[
      { name: "email", label: "Work email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
      { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
    ]} />
  );
}

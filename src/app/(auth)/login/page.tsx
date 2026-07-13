import { LoginForm } from "./login-form";

/**
 * Nur interne Pfade als Redirect zulassen — kein "//host" (protokoll-relativ)
 * und kein "/\\host". Verhindert Open-Redirect über den next-Parameter.
 */
function safeNext(next?: string): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard";
  }
  return next;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return <LoginForm nextPath={safeNext(searchParams.next)} />;
}

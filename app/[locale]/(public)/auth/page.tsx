"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { AuthForm } from "./AuthForm";
import { useAuth } from "@/hooks/useAuth";
import { Container } from "@/components/layout/Container";
import styles from "./page.module.css";

export default function AuthPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionInvalid = searchParams.get("session_invalid") === "1";
  const hasClearedStaleSession = useRef(false);

  useEffect(() => {
    if (sessionInvalid && user && !hasClearedStaleSession.current) {
      hasClearedStaleSession.current = true;
      signOut().then(() => router.replace("/auth"));
    }
  }, [sessionInvalid, user, signOut, router]);

  useEffect(() => {
    if (!loading && user && !sessionInvalid) {
      router.replace("/dashboard");
    }
  }, [user, loading, sessionInvalid, router]);

  if (loading || (sessionInvalid && user)) {
    return (
      <Container size="sm">
        <div className={styles.loading}>Loading…</div>
      </Container>
    );
  }

  if (user) {
    return null;
  }

  return <AuthForm />;
}

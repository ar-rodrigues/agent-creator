"use client";

import {useCallback, useEffect, useState} from "react";
import type {AuthChangeEvent, Session, User} from "@supabase/supabase-js";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";

export type AuthError = string | null;

export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: AuthError;
  signIn: (email: string, password: string) => Promise<{error: AuthError}>;
  signUp: (
    email: string,
    password: string,
    options?: {emailRedirectTo?: string},
  ) => Promise<{error: AuthError; needsConfirmation?: boolean}>;
  signOut: () => Promise<void>;
  resetPassword: (email: string, redirectTo?: string) => Promise<{error: AuthError}>;
  updatePassword: (newPassword: string) => Promise<{error: AuthError}>;
  updateEmail: (newEmail: string) => Promise<{error: AuthError}>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError>(null);

  const client = getSupabaseBrowserClient();

  useEffect(() => {
    const {
      data: {subscription},
    } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [client.auth]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{error: AuthError}> => {
      setError(null);
      const {error: signInError} = await client.auth.signInWithPassword({
        email,
        password,
      });
      const err = signInError?.message ?? null;
      setError(err);
      return {error: err};
    },
    [client.auth],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      options?: {emailRedirectTo?: string},
    ): Promise<{error: AuthError; needsConfirmation?: boolean}> => {
      setError(null);
      const {error: signUpError, data} = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: options?.emailRedirectTo,
        },
      });
      const err = signUpError?.message ?? null;
      setError(err);
      return {
        error: err,
        needsConfirmation: !!data?.user && !signUpError && !data.session,
      };
    },
    [client.auth],
  );

  const signOut = useCallback(async () => {
    setError(null);
    await client.auth.signOut();
  }, [client.auth]);

  const resetPassword = useCallback(
    async (email: string, redirectTo?: string): Promise<{error: AuthError}> => {
      setError(null);
      const {error: resetError} = await client.auth.resetPasswordForEmail(
        email,
        redirectTo ? {redirectTo} : undefined,
      );
      const err = resetError?.message ?? null;
      setError(err);
      return {error: err};
    },
    [client.auth],
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<{error: AuthError}> => {
      setError(null);
      const {error: updateError} = await client.auth.updateUser({
        password: newPassword,
      });
      const err = updateError?.message ?? null;
      setError(err);
      return {error: err};
    },
    [client.auth],
  );

  const updateEmail = useCallback(
    async (newEmail: string): Promise<{error: AuthError}> => {
      setError(null);
      const {error: updateError} = await client.auth.updateUser({
        email: newEmail,
      });
      const err = updateError?.message ?? null;
      setError(err);
      return {error: err};
    },
    [client.auth],
  );

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    updateEmail,
  };
}

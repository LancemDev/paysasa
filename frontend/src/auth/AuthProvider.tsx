import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setUnauthorizedHandler } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True after the session expired (not a user-initiated sign-out); the sign-in page explains it. */
  expired: boolean;
  /** True while handling a password-recovery link. */
  recovering: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const userSignedOut = useRef(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_IN") setExpired(false);
      if (event === "SIGNED_OUT" && !userSignedOut.current) setExpired(true);
      if (event === "SIGNED_OUT") userSignedOut.current = false;
    });
    setUnauthorizedHandler(() => {
      // The backend rejected a refreshed token: the session is gone.
      void supabase.auth.signOut({ scope: "local" });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      expired,
      recovering,
      signOut: async () => {
        userSignedOut.current = true;
        setRecovering(false);
        await supabase.auth.signOut();
      },
    }),
    [session, loading, expired, recovering],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

"use client";

import {useMemo} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";

export function useSupabaseClient() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);

  return {
    client,
  };
}


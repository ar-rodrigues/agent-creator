import {NextRequest, NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Ignore errors here; surface them in route handlers or components instead.
  }

  return response;
}


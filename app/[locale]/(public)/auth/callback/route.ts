import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

function getLocaleFromPath(pathname: string): (typeof routing.locales)[number] {
  const segment = pathname.split("/")[1];
  if (
    segment &&
    (routing.locales as readonly string[]).includes(segment)
  )
    return segment as (typeof routing.locales)[number];
  return routing.defaultLocale;
}

function buildRedirectPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return `/${locale}${path}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const pathname = request.nextUrl.pathname;
  const locale = getLocaleFromPath(pathname);

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `${buildRedirectPath(locale, "/auth")}?error=missing_code`,
        request.url
      )
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `${buildRedirectPath(locale, "/auth")}?error=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }

  return NextResponse.redirect(new URL(buildRedirectPath(locale, next), request.url));
}

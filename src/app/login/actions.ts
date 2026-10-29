"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { loginEmailFromIdentifier } from "@/domain/auth/login-identifier";

const LoginSchema = z.object({
  identifier: z.string(),
  password: z.string().min(12).max(128),
});

function safeDestination(value: FormDataEntryValue | null): string {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    ? value
    : "/workspace";
}

function loginErrorDestination(nextPath: string, error: "invalid" | "credentials"): string {
  const query = new URLSearchParams({ error, next: nextPath });
  return `/login?${query.toString()}`;
}

export async function login(formData: FormData): Promise<never> {
  const nextPath = safeDestination(formData.get("next"));
  const parsed = LoginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(loginErrorDestination(nextPath, "invalid"));
  }

  const client = await createSupabaseServerClient();
  let email: string;
  try {
    email = loginEmailFromIdentifier(parsed.data.identifier);
  } catch {
    redirect(loginErrorDestination(nextPath, "invalid"));
  }
  const response = await client.auth.signInWithPassword({ email, password: parsed.data.password });
  if (response.error) {
    redirect(loginErrorDestination(nextPath, "credentials"));
  }

  redirect(nextPath);
}

export async function logout() {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/login");
}

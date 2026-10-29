import "server-only";

import { cookies } from "next/headers";
import { PostgresClient } from "../../../server/client.mjs";
import { findSession, signIn, signOut, sessionCookieName, sessionSeconds } from "../../../server/identity.mjs";

export { PostgresClient };

export async function createDatabaseClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  const user = await findSession(token);
  return new PostgresClient(user, {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const result = await signIn(email, password);
      if (!result) return { data: { user: null }, error: { message: "Invalid credentials or login temporarily limited" } };
      cookieStore.set(sessionCookieName(), result.token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionSeconds,
      });
      return { data: { user: result.user }, error: null };
    },
    signOut: async () => {
      await signOut(token);
      cookieStore.set(sessionCookieName(), "", {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0,
      });
      return { error: null };
    },
  });
}

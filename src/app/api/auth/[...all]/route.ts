import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/platform/auth/auth";

/** Better Auth endpoints (sign-in, sign-out, password reset, sessions) under /api/auth/* (M02-01). */
export const { GET, POST } = toNextJsHandler(auth);

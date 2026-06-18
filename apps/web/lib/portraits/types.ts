/**
 * Result shape for portrait server actions. Lives in a non-'use server'
 * module so it can be exported as a type without tripping Next.js's
 * "only async functions can be exported" rule on action files.
 *
 * The client (PortraitGeneratorButton) imports this for typing only;
 * actions return values of this shape so production errors surface as
 * real strings instead of the masked "Server Components render" wall.
 */
export type PortraitActionResult =
  | { ok: true }
  | { ok: false; error: string };

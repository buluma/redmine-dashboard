import { ZodSchema } from "zod";

export function jsonError(
  message: string,
  status = 400,
  headers?: Record<string, string>,
): Response {
  return Response.json({ error: message }, { status, headers });
}

export async function parseJson<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

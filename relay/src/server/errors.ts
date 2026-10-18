export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const unauthorized = () => new AppError(401, "unauthorized", "Please sign in to continue.");
export const forbidden = (what = "do this") => new AppError(403, "forbidden", `You don't have permission to ${what}.`);
export const notFound = (what = "Record") => new AppError(404, "not_found", `${what} not found.`);
export const conflict = (msg: string, details?: unknown) => new AppError(409, "conflict", msg, details);
export const invalid = (msg: string, details?: unknown) => new AppError(422, "invalid", msg, details);

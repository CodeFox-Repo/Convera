import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError, ZodTypeAny, z } from "zod";

/**
 * Generic middleware to validate request bodies using Zod schemas.
 * Returns a 400 error response if validation fails.
 */
export function validateBody<T extends ZodTypeAny>(
  schema: T,
): RequestHandler<{}, any, z.infer<T>> {
  return (req: Request<{}, any, z.infer<T>>, res: Response, next: NextFunction) => {
    try {
      const result = schema.parse(req.body);
      // Replace body with parsed data to ensure correct types downstream
      req.body = result;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        }));
        res.status(400).json({ status: "error", errors: details });
      } else {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
      }
    }
  };
}

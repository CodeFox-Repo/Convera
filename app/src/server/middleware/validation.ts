import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";

/**
 * Generic middleware to validate request bodies using Zod schemas.
 * Returns a 400 error response if validation fails.
 */
export function validateBody(schema: ZodSchema<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
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

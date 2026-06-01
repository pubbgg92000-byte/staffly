import {
  type ArgumentMetadata,
  BadRequestException,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Use as a controller method-level pipe: `@UsePipes(new ZodBody(MySchema))`
 * or directly on a parameter: `@Body(new ZodBody(MySchema)) body: MyType`.
 */
export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "validation.failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return parsed.data;
  }
}

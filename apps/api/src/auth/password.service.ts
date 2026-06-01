import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

/**
 * argon2id wrapper.
 *
 * Parameters chosen per docs/08 § 6.6:
 *   parallelism = 2, memory = 64 MiB, iterations = 3.
 */
@Injectable()
export class PasswordService {
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 2,
  };

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}

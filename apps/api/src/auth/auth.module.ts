import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { loadEnv } from "../infra/config/env";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokensService } from "./tokens.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CsrfGuard } from "./guards/csrf.guard";
import { RbacModule } from "../rbac/rbac.module";
import { StorageModule } from "../storage/storage.module";
import { MailerModule } from "../mailer/mailer.module";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = loadEnv();
        return {
          secret: env.JWT_SECRET,
          signOptions: { algorithm: "HS256" },
        };
      },
    }),
    RbacModule,
    StorageModule,
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokensService,
    JwtAuthGuard,
    CsrfGuard,
  ],
  exports: [AuthService, TokensService, JwtAuthGuard, CsrfGuard],
})
export class AuthModule {}

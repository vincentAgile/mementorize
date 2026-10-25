import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DEFAULT_ACCESS_TOKEN_TTL } from './auth-user.js';
import { SessionsService } from './sessions.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';

@Module({
  imports: [
    UsersModule,
    // register() (rather than the bare module) provides the options object
    // that every AuthGuard subclass (JwtAuthGuard, LocalAuthGuard) injects.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // registerAsync: the secret is read from .env through ConfigService,
    // once configuration is loaded, instead of being hard-coded.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // MEM-85: short, renewed silently with the renewal token.
        signOptions: { expiresIn: Number(config.get('ACCESS_TOKEN_TTL') ?? DEFAULT_ACCESS_TOKEN_TTL) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, LocalStrategy, JwtStrategy],
  // Modules that use JwtAuthGuard (e.g. QuotesModule) import AuthModule:
  // the guard needs PassportModule's configuration to be visible there.
  exports: [PassportModule, SessionsService],
})
export class AuthModule {}

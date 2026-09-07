import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Auth } from '../auth/auth.decorator';
import { AuthService, type TokenMeta } from '../auth/auth.service';
import type { AuthContext } from '../auth/auth.types';

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/tokens')
export class TokensController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() dto: CreateTokenDto,
  ): { id: string; token: string; prefix: string } {
    // Plaintext token is returned exactly once — only the hash is stored.
    return this.auth.createToken(auth.userId, auth.email, dto.name);
  }

  @Get()
  list(@Auth() auth: AuthContext): { tokens: TokenMeta[] } {
    // Per-user: only this user's tokens, camelCase, never hashes.
    return { tokens: this.auth.listTokens(auth.userId) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    if (!this.auth.revokeToken(auth.userId, id)) {
      throw new NotFoundException('not_found');
    }
    return { ok: true };
  }
}

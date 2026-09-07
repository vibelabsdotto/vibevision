import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth.types';
import type { Setting } from './settings.service';
import { SettingsService } from './settings.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get(':key')
  get(@Auth() auth: AuthContext, @Param('key') key: string): Setting {
    return this.settings.get(auth.userId, key);
  }

  @Put(':key')
  set(
    @Auth() auth: AuthContext,
    @Param('key') key: string,
    @Body() body: { value?: unknown },
  ): Setting {
    if (typeof body?.value !== 'string') {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'value must be a string',
      });
    }
    return this.settings.set(auth.userId, key, body.value);
  }
}

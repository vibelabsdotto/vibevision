import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import type { Setting } from './settings.service';
import { SettingsService } from './settings.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get(':key')
  get(@Param('key') key: string): Setting {
    return this.settings.get(key);
  }

  @Put(':key')
  set(@Param('key') key: string, @Body() body: { value?: unknown }): Setting {
    if (typeof body?.value !== 'string') {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'value must be a string',
      });
    }
    return this.settings.set(key, body.value);
  }
}

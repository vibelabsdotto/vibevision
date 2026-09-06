import { Injectable } from '@nestjs/common';
import { nowIso, newId, str } from '../common/util';
import { DatabaseService } from '../database/database.service';

export interface Setting {
  key: string;
  value: string | null;
}

@Injectable()
export class SettingsService {
  constructor(private readonly database: DatabaseService) {}

  get(key: string): Setting {
    const row = this.database.sqlite
      .prepare('select key, value from settings where key = ?')
      .get(str(key)) as { key: string; value: string } | undefined;
    return { key: str(key), value: row?.value ?? null };
  }

  set(key: string, value: unknown): Setting {
    const k = str(key);
    const v = str(value);
    const now = nowIso();
    const existing = this.database.sqlite
      .prepare('select id from settings where key = ?')
      .get(k) as { id: string } | undefined;
    if (existing) {
      this.database.sqlite
        .prepare('update settings set value = ?, updated_at = ? where key = ?')
        .run(v, now, k);
    } else {
      this.database.sqlite
        .prepare(
          'insert into settings (id, key, value, created_at, updated_at) values (?, ?, ?, ?, ?)',
        )
        .run(newId(), k, v, now, now);
    }
    return { key: k, value: v };
  }
}

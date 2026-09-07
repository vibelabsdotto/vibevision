import { Injectable } from '@nestjs/common';
import { nowIso, newId, str } from '../common/util';
import { DatabaseService } from '../database/database.service';

export interface Setting {
  key: string;
  value: string | null;
}

/**
 * Per-user key-value settings (contract §2-3): every row is owned by one
 * user_id; keys are unique per user, not globally. Cross-user reads return
 * null (never another user's value).
 */
@Injectable()
export class SettingsService {
  constructor(private readonly database: DatabaseService) {}

  get(userId: string, key: string): Setting {
    const row = this.database.sqlite
      .prepare('select key, value from settings where key = ? and user_id = ?')
      .get(str(key), userId) as { key: string; value: string } | undefined;
    return { key: str(key), value: row?.value ?? null };
  }

  set(userId: string, key: string, value: unknown): Setting {
    const k = str(key);
    const v = str(value);
    const now = nowIso();
    const existing = this.database.sqlite
      .prepare('select id from settings where key = ? and user_id = ?')
      .get(k, userId) as { id: string } | undefined;
    if (existing) {
      this.database.sqlite
        .prepare(
          'update settings set value = ?, updated_at = ? where key = ? and user_id = ?',
        )
        .run(v, now, k, userId);
    } else {
      this.database.sqlite
        .prepare(
          'insert into settings (id, user_id, key, value, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
        )
        .run(newId(), userId, k, v, now, now);
    }
    return { key: k, value: v };
  }
}

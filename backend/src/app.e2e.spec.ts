import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import request from 'supertest';
import { AppModule } from './app.module';
import { AuthProviderToken } from './auth/auth.constants';
import type { Auth } from './auth/auth';
import { AuthService } from './auth/auth.service';
import { DatabaseService } from './database/database.service';
import { JsonExceptionFilter } from './http/json-exception.filter';

process.env.DATABASE_PATH = ':memory:';
process.env.BETTER_AUTH_SECRET = 'test-secret-32-bytes-long-xxxxxx';

let app: INestApplication;
let token: string;

function authed(method: 'get' | 'post' | 'put' | 'delete', url: string) {
  return request(app.getHttpServer())
    [method](url)
    .set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  // Re-apply production pipe/filter (Test module skips main.ts).
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new JsonExceptionFilter());
  // Mount the Better Auth handler like main.ts does (module skips main.ts).
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.use('/api/auth', toNodeHandler(app.get<Auth>(AuthProviderToken)));
  await app.init();
  const auth = app.get(AuthService);
  const db = app.get(DatabaseService);
  const nowMs = Date.now();
  db.sqlite
    .prepare(
      'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    )
    .run('e2e-user', 'e2e', 'test@vibelabs.local', 0, nowMs, nowMs);
  token = auth.createToken('e2e-user', 'test@vibelabs.local', 'e2e').token;
});

afterAll(async () => {
  await app.close();
});

describe('app e2e', () => {
  it('GET /health is public', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('rejects unauthenticated API access with exact body', async () => {
    const res = await request(app.getHttpServer()).get('/v1/cycles');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('404s with exact body', async () => {
    const res = await authed('get', '/v1/cycles/missing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('runs the full 12-week flow', async () => {
    // cycle (creates 12 weeks)
    const cycleRes = await authed('post', '/v1/cycles').send({
      title: 'E2E Cycle',
      start_date: '2026-08-31',
    });
    expect(cycleRes.status).toBe(201);
    const cycleId = cycleRes.body.cycle.id as string;
    expect(cycleRes.body.cycle.slug).toBe('e2e-cycle');
    const weeksRes = await authed(
      'get',
      `/v1/cycle-weeks?cycle_id=${cycleId}&limit=100`,
    );
    expect(weeksRes.body.total).toBe(12);

    // activate
    const activeRes = await authed('post', `/v1/cycles/${cycleId}/activate`);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.cycle.status).toBe('active');

    // goal + tactic (volume, 3 assets/week)
    const goalRes = await authed('post', '/v1/goals').send({
      cycle_id: cycleId,
      title: 'Audience',
    });
    expect(goalRes.status).toBe(201);
    const goalId = goalRes.body.goal.id as string;
    const tacticRes = await authed('post', '/v1/tactics').send({
      goal_id: goalId,
      title: 'SEO assets',
      tracking_type: 'quantity',
      recurrence_type: 'times_per_week',
      target_value: 3,
      unit: 'assets',
    });
    expect(tacticRes.status).toBe(201);
    const tacticId = tacticRes.body.tactic.id as string;

    // schedule block (2 of 3) + over-budget rejection with exact code
    const blockRes = await authed('post', '/v1/calendar-blocks').send({
      tactic_id: tacticId,
      date: '2026-09-02',
      planned_value: 2,
    });
    expect(blockRes.status).toBe(201);
    const overRes = await authed('post', '/v1/calendar-blocks').send({
      tactic_id: tacticId,
      date: '2026-09-03',
      planned_value: 2,
    });
    expect(overRes.status).toBe(400);
    expect(overRes.body.error).toBe('bad_request');

    // log entry + daily-cap rejection
    const entryRes = await authed('post', '/v1/entries/log').send({
      tactic_id: tacticId,
      date: '2026-09-02',
      value: 2,
    });
    expect(entryRes.status).toBe(201);
    const capRes = await authed('post', '/v1/entries/log').send({
      tactic_id: tacticId,
      date: '2026-09-02',
      value: 1,
    });
    expect(capRes.status).toBe(400);
    expect(capRes.body.error).toBe('bad_request');

    // score + dashboard
    const scoreRes = await authed(
      'get',
      `/v1/cycles/${cycleId}/score?week=1&as_of=2026-09-06&include_as_of=true`,
    );
    expect(scoreRes.status).toBe(200);
    expect(scoreRes.body.score.tactic_scores).toHaveLength(1);
    expect(scoreRes.body.score.tactic_scores[0].actual).toBe(2);
    const dashRes = await authed(
      'get',
      `/v1/dashboard?cycle_id=${cycleId}&as_of=2026-09-02`,
    );
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.dashboard.current_week).toBe(1);
    expect(dashRes.body.dashboard.today_tactics).toHaveLength(1);

    // checkin + report (json + markdown)
    const checkinRes = await authed('post', '/v1/daily-logs/checkin').send({
      cycle_id: cycleId,
      date: '2026-09-02',
      kind: 'morning',
      one_thing: 'Ship it',
    });
    expect(checkinRes.status).toBe(200);
    expect(checkinRes.body.daily_log.morning_done).toBe(1);
    const reportRes = await authed(
      'get',
      `/v1/cycles/${cycleId}/weeks/1/report`,
    );
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.score.tactic_scores).toHaveLength(1);
    const mdRes = await authed(
      'get',
      `/v1/cycles/${cycleId}/weeks/1/report?format=markdown`,
    );
    expect(mdRes.status).toBe(200);
    expect(mdRes.text).toContain('# E2E Cycle — Week 1 Report');

    // undo + 422 exact body
    const undoRes = await authed('post', '/v1/entries/undo').send({
      tactic_id: tacticId,
      date: '2026-09-02',
    });
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.undone).toBe(entryRes.body.tactic_entry.id);
    const badRes = await authed('post', '/v1/cycles').send({
      title: 'Bad',
      start_date: '2026-08-31',
      nope: 1,
    });
    expect(badRes.status).toBe(422);
    expect(badRes.body).toEqual({
      error: 'unprocessable',
      unknown_fields: ['nope'],
      valid_fields: ['title', 'start_date', 'vision', 'status', 'slug'],
    });
  });

  it('manages tokens without leaking hashes', async () => {
    const created = await authed('post', '/v1/tokens').send({ name: 'second' });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^vv_[0-9a-f]{48}$/);
    const listed = await authed('get', '/v1/tokens');
    expect(listed.status).toBe(200);
    for (const row of listed.body.tokens as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty('token_hash');
      expect(row).not.toHaveProperty('token');
    }
  });

  it('signs up via Better Auth and authorizes by session cookie', async () => {
    const signup = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        email: 'web@vibelabs.local',
        password: 'web-web-web-123',
        name: 'Web',
      });
    expect(signup.status).toBe(200);
    const rawCookies: unknown = signup.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies.filter((c): c is string => typeof c === 'string')
      : [];
    expect(cookies.join(';')).toContain('better-auth.session_token');
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const session = await request(app.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe('web@vibelabs.local');
    // session cookie authorizes the JSON API (web SSR cookie passthrough)
    const cycles = await request(app.getHttpServer())
      .get('/v1/cycles')
      .set('Cookie', cookie);
    expect(cycles.status).toBe(200);
  });
});

import { access } from 'node:fs/promises';

const requiredArtifacts = [
  'dist/src/main.js',
  'dist/src/app.module.js',
  'dist/src/auth/auth.service.js',
  'dist/src/database/database.service.js',
  'dist/src/health.controller.js',
  'dist/src/cycles/cycles.controller.js',
  'dist/src/goals/goals.controller.js',
  'dist/src/tactics/tactics.controller.js',
  'dist/src/entries/entries.controller.js',
  'dist/src/calendar-blocks/calendar-blocks.controller.js',
  'dist/src/scores/scores.controller.js',
  'dist/src/dashboard/dashboard.controller.js',
  'dist/src/reports/reports.controller.js',
  'dist/src/tokens/tokens.controller.js',
];

await Promise.all(requiredArtifacts.map((path) => access(path)));
console.log(`verified ${requiredArtifacts.length} production build artifacts`);

// npm run db:stop: stops the local database from `npm run db:local`, including one left
// behind by a terminal that was closed instead of stopped with Ctrl+C. Only PostgreSQL
// processes started from this project's node_modules are touched, never another
// PostgreSQL on the machine.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const windows = process.platform === 'win32';
// The binaries package embedded-postgres installed for this machine, e.g. @embedded-postgres/windows-x64.
const { pg_ctl: pgCtl, postgres } = await import(`@embedded-postgres/${windows ? 'windows' : process.platform}-${process.arch}`);
const binDir = dirname(postgres);
const dataDir = join(process.cwd(), '.pgdata');

// 1. The clean way: ask the server to shut down.
try {
  execFileSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'pipe' });
  console.log('PostgreSQL stopped.');
} catch {
  // Not running, or the main process is gone and only its children are left.
}

// 2. Children of a killed server can keep port 5433; end any that run from our binaries.
try {
  if (windows) {
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name = 'postgres.exe'\" | " +
      `Where-Object { $_.ExecutablePath -like '${binDir.replace(/'/g, "''")}*' } | ` +
      // Children exit by themselves once the main process is gone, so a vanished id is not an error.
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }';
    const killed = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
    if (killed) console.log(`Ended leftover PostgreSQL processes: ${killed.split(/\s+/).join(', ')}`);
  } else {
    execFileSync('pkill', ['-f', postgres], { stdio: 'ignore' });
    console.log('Ended leftover PostgreSQL processes.');
  }
} catch {
  // pkill exits 1 when nothing matched: nothing was left over.
}

if (existsSync(join(dataDir, 'postmaster.pid'))) {
  console.log('A postmaster.pid is left in .pgdata; PostgreSQL removes it itself on the next start.');
}
console.log('Done. Start it again with: npm run db:local');

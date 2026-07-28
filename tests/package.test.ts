import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('npm package', () => {
  it('ships the herdr-games executable and runtime files', () => {
    const packagePath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as Record<string, unknown>;

    expect(pkg.name).toBe('herdr-games');
    expect(pkg.bin).toEqual({ 'herdr-games': 'bin/herdr-games.js' });
    expect(pkg.files).toEqual(['bin', 'dist', 'README.md', 'README.KR.md']);
    expect(pkg.private).toBeUndefined();
  });
});

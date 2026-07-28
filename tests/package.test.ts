import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('npm package', () => {
  it('ships the herdr-visual-lab executable and runtime files', () => {
    const packagePath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as Record<string, unknown>;

    expect(pkg.name).toBe('herdr-visual-lab');
    expect(pkg.bin).toEqual({ 'herdr-visual-lab': 'bin/herdr-visual-lab.js' });
    expect(pkg.files).toEqual(['bin', 'dist', 'README.md', 'README.KR.md']);
    expect(pkg.private).toBeUndefined();
  });
});

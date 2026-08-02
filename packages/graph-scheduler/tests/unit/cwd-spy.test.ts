import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('cwd spy', () => {
  it('spy affects path.resolve', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/fake/project');
    try {
      console.log('CWD():', process.cwd());
      console.log('RESOLVE:', resolve('.graph-scheduler', 'config.json'));
    } finally {
      spy.mockRestore();
    }
  });
});

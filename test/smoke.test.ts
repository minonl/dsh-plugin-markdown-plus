import { describe, expect, test } from 'bun:test';

import host from '../src/index.ts';
import { clientName } from '../src/client.ts';

describe('scaffold smoke', () => {
  test('宿主半导出 name/apply', () => {
    expect(host.name).toBe('@minonl/dsh-plugin-markdown-plus');
    expect(typeof host.apply).toBe('function');
  });

  test('客户端半导出标识', () => {
    expect(clientName).toBe('@minonl/dsh-plugin-markdown-plus');
  });
});

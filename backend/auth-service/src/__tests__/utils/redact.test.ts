import { redactSensitiveFields } from '@shared/utils/redact';

describe('redactSensitiveFields', () => {
  it('redacts known-sensitive top-level keys', () => {
    const input = { email: 'a@example.com', password: 'hunter2' };
    expect(redactSensitiveFields(input)).toEqual({
      email: 'a@example.com',
      password: '[REDACTED]',
    });
  });

  it('redacts sensitive keys regardless of case', () => {
    const input = { Password: 'hunter2', NEWPASSWORD: 'hunter3' };
    expect(redactSensitiveFields(input)).toEqual({
      Password: '[REDACTED]',
      NEWPASSWORD: '[REDACTED]',
    });
  });

  it('redacts nested sensitive keys', () => {
    const input = { user: { email: 'a@example.com', token: 'abc.def.ghi' } };
    expect(redactSensitiveFields(input)).toEqual({
      user: { email: 'a@example.com', token: '[REDACTED]' },
    });
  });

  it('redacts sensitive keys inside arrays of objects', () => {
    const input = [{ password: 'a' }, { password: 'b' }];
    expect(redactSensitiveFields(input)).toEqual([
      { password: '[REDACTED]' },
      { password: '[REDACTED]' },
    ]);
  });

  it('redacts an authorization header, the way req.headers would be logged', () => {
    const input = { authorization: 'Bearer eyJabc', 'content-type': 'application/json' };
    expect(redactSensitiveFields(input)).toEqual({
      authorization: '[REDACTED]',
      'content-type': 'application/json',
    });
  });

  it('leaves non-sensitive values untouched', () => {
    const input = { username: 'alice', roles: ['reader'], count: 3 };
    expect(redactSensitiveFields(input)).toEqual(input);
  });

  it('passes through primitives and null/undefined unchanged', () => {
    expect(redactSensitiveFields('hello')).toBe('hello');
    expect(redactSensitiveFields(42)).toBe(42);
    expect(redactSensitiveFields(null)).toBe(null);
    expect(redactSensitiveFields(undefined)).toBe(undefined);
  });
});

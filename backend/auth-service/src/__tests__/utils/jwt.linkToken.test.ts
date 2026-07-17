import { generateLinkToken, verifyLinkToken, generateToken, TokenValidationError } from '@shared/utils/jwt';

describe('generateLinkToken / verifyLinkToken', () => {
  it('round-trips the userId through a generated link token', () => {
    const token = generateLinkToken('user-123');
    expect(verifyLinkToken(token)).toBe('user-123');
  });

  it('rejects an access-typed token', () => {
    const token = generateToken({ id: 'user-123', userId: 'user-123', type: 'access' });
    expect(() => verifyLinkToken(token)).toThrow(TokenValidationError);
    expect(() => verifyLinkToken(token)).toThrow('Invalid link token');
  });

  it('rejects a garbage string', () => {
    expect(() => verifyLinkToken('not-a-real-token')).toThrow();
  });

  it('rejects an expired link token', () => {
    const token = generateToken({ id: 'user-123', userId: 'user-123', type: 'oauth_link' }, '-1s');
    expect(() => verifyLinkToken(token)).toThrow('Token has expired');
  });

  it('rejects a link token whose payload lacks userId', () => {
    const token = generateToken({ id: 'user-123', type: 'oauth_link' });
    expect(() => verifyLinkToken(token)).toThrow('Invalid link token');
  });
});

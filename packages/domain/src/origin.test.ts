import { describe, expect, it } from 'vitest';
import { hostOf, type OriginRejection, parseOrigin } from './origin.ts';

describe('parseOrigin', () => {
  it.each([
    ['https://review.example.com', 'review.example.com'],
    ['https://review.example.com/', 'review.example.com'],
    ['  https://Review.Example.COM  ', 'review.example.com'],
    ['https://review.example.com./', 'review.example.com'],
    ['https://jury.prakashsewani.com', 'jury.prakashsewani.com'],
    ['https://a-b.c-d.example', 'a-b.c-d.example'],
    ['https://bücher.example', 'xn--bcher-kva.example'],
  ])('accepts %j as %s', (input, host) => {
    expect(parseOrigin(input)).toEqual({ ok: true, origin: { url: `https://${host}`, host } });
  });

  it.each<[string, OriginRejection]>([
    ['', 'not_a_url'],
    ['review.example.com', 'not_a_url'],
    ['http://review.example.com', 'not_https'],
    ['ftp://review.example.com', 'not_https'],
    ['https://user:pw@review.example.com', 'has_credentials'],
    ['https://user@review.example.com', 'has_credentials'],
    ['https://review.example.com:8443', 'has_port'],
    ['https://review.example.com:443', 'has_port'],
    ['https://review.example.com:', 'has_port'],
    ['https://[2001:db8::1]:8443', 'has_port'],
    ['https://review.example.com/jury-forge', 'has_path'],
    ['https://review.example.com/?a=1', 'has_path'],
    ['https://review.example.com?', 'has_path'],
    ['https://review.example.com#x', 'has_path'],
    ['https://192.168.1.20', 'ip_address'],
    ['https://0x7f.1', 'ip_address'],
    ['https://[::1]', 'ip_address'],
    ['https://[2001:db8::1]', 'ip_address'],
    ['https://localhost', 'not_public_name'],
    ['https://jury.localhost', 'not_public_name'],
    ['https://intranet', 'not_public_name'],
    ['https://review.example.123', 'not_a_url'],
    ['https://under_score.example.com', 'not_public_name'],
    ['https://-lead.example.com', 'not_public_name'],
    [`https://${'a'.repeat(64)}.example.com`, 'not_public_name'],
    [`https://${Array.from({ length: 64 }, () => 'abc').join('.')}.com`, 'not_public_name'],
  ])('rejects %j as %s', (input, reason) => {
    expect(parseOrigin(input)).toEqual({ ok: false, reason });
  });
});

describe('hostOf', () => {
  it.each([
    ['review.example.com', 'review.example.com'],
    ['Review.Example.com', 'review.example.com'],
    ['review.example.com.', 'review.example.com'],
    ['review.example.com:443', 'review.example.com'],
    ['[::1]', '[::1]'],
  ])('reads %j as %s', (value, host) => {
    expect(hostOf(value)).toBe(host);
  });

  it('accepts the default port it is given', () => {
    expect(hostOf('app:3000', 3000)).toBe('app');
    expect(hostOf('app:3000')).toBeNull();
  });

  it.each(['', ':443', 'a:b', 'review.example.com:8443', 'a b', '.'])('refuses %j', (value) => {
    expect(hostOf(value)).toBeNull();
  });
});

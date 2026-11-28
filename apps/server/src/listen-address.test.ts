import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP_BIND, ListenAddressError, parseListenAddress } from './listen-address.ts';

describe('parseListenAddress', () => {
  it('parses the native default as loopback', () => {
    expect(parseListenAddress(DEFAULT_SETUP_BIND)).toEqual({
      host: '127.0.0.1',
      port: 8080,
      loopback: true,
    });
  });

  it('parses the in-container Compose bind as not loopback', () => {
    expect(parseListenAddress('0.0.0.0:8080')).toEqual({
      host: '0.0.0.0',
      port: 8080,
      loopback: false,
    });
  });

  it('treats all of 127.0.0.0/8 and ::1 as loopback', () => {
    expect(parseListenAddress('127.1.2.3:9000').loopback).toBe(true);
    expect(parseListenAddress('[::1]:8080')).toEqual({ host: '::1', port: 8080, loopback: true });
    expect(parseListenAddress('[::]:8080').loopback).toBe(false);
    expect(parseListenAddress('10.0.0.5:8080').loopback).toBe(false);
  });

  it.each([
    '',
    '8080',
    'localhost:8080',
    '127.0.0.1',
    '127.0.0.1:',
    '127.0.0.1:0',
    '127.0.0.1:65536',
    '127.0.0.1:80a',
    '::1:8080',
    '[127.0.0.1]:8080',
    '[::1]8080',
    '999.0.0.1:8080',
  ])('rejects %j', (value) => {
    expect(() => parseListenAddress(value)).toThrow(ListenAddressError);
  });
});

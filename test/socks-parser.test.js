import { describe, it, expect } from 'vitest';
import { parseSocks } from '../src/parsers/protocols/socksParser.js';
import { ProxyParser } from '../src/parsers/ProxyParser.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { convertYamlProxyToObject } from '../src/parsers/convertYamlProxyToObject.js';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const createTestApp = () => createApp({
    kv: new MemoryKVAdapter(),
    assetFetcher: null,
    logger: console,
    config: { configTtlSeconds: 60, shortLinkTtlSeconds: null }
});

// Same shape as a real token-auth socks link, dummy token.
const SOCKS_LINK = 'socks://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:@fireside.example.com:7135#URnetwork-US-Test';

/**
 * Sublink dropped socks:// links silently: ProxyParser had no socks
 * entry, so the link never became a proxy and no builder ever saw it.
 * These tests pin the full path — parse, Clash output, sing-box output —
 * for the link shapes SOCKS providers actually emit.
 */
describe('parseSocks', () => {
    it('parses username, password, host, port and name', () => {
        expect(parseSocks('socks://alice:s3cret@example.com:1080#My-Socks')).toEqual({
            type: 'socks',
            tag: 'My-Socks',
            server: 'example.com',
            server_port: 1080,
            version: '5',
            username: 'alice',
            password: 's3cret'
        });
    });

    it('omits an empty password instead of emitting a blank one', () => {
        // Token-auth providers (e.g. URnetwork) emit user=token, pass empty.
        const parsed = parseSocks('socks://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:@fireside.example.com:7135#URnetwork-US-Test');
        expect(parsed.username).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        expect(parsed.password).toBeUndefined();
        expect(parsed.server).toBe('fireside.example.com');
        expect(parsed.server_port).toBe(7135);
        expect(parsed.tag).toBe('URnetwork-US-Test');
    });

    it('parses links without auth and without a name', () => {
        const parsed = parseSocks('socks://example.com:1080');
        expect(parsed.type).toBe('socks');
        expect(parsed.server).toBe('example.com');
        expect(parsed.server_port).toBe(1080);
        expect(parsed.username).toBeUndefined();
        expect(parsed.tag).toBe('SOCKS5');
    });

    it('decodes percent-encoded userinfo', () => {
        const parsed = parseSocks('socks://user%40name:p%40ss@example.com:1080#n');
        expect(parsed.username).toBe('user@name');
        expect(parsed.password).toBe('p@ss');
    });

    it('returns undefined without a usable host or port', () => {
        expect(parseSocks('socks://example.com')).toBeUndefined();
        expect(parseSocks('socks://:1080')).toBeUndefined();
    });
});

describe('ProxyParser socks dispatch', () => {
    it('parses socks:// and socks5:// links', async () => {
        const viaSocks = await ProxyParser.parse('socks://alice:pw@example.com:1080#n', 'test');
        expect(viaSocks?.type).toBe('socks');
        const viaSocks5 = await ProxyParser.parse('socks5://alice:pw@example.com:1080#n', 'test');
        expect(viaSocks5?.type).toBe('socks');
    });
});

describe('socks node in builder outputs', () => {
    const node = {
        type: 'socks',
        tag: 'URnetwork-US-Test',
        server: 'fireside.example.com',
        server_port: 7135,
        version: '5',
        username: 'TOKEN'
    };

    it('Clash emits a socks proxy with name/port and no empty password', () => {
        const converted = ClashConfigBuilder.prototype.convertProxy(node);
        expect(converted).toEqual({
            name: 'URnetwork-US-Test',
            type: 'socks',
            server: 'fireside.example.com',
            port: 7135,
            username: 'TOKEN',
            udp: true
        });
    });

    it('sing-box passes the socks outbound through unchanged', () => {
        const converted = SingboxConfigBuilder.prototype.convertProxy(node);
        expect(converted.type).toBe('socks');
        expect(converted.tag).toBe('URnetwork-US-Test');
        expect(converted.server).toBe('fireside.example.com');
        expect(converted.server_port).toBe(7135);
        expect(converted.username).toBe('TOKEN');
    });

    it('Clash YAML input converts a socks proxy', () => {
        const converted = convertYamlProxyToObject({
            name: 'Yaml-Socks',
            type: 'socks',
            server: 'example.com',
            port: 1080,
            username: 'alice',
            password: 'pw'
        });
        expect(converted).toMatchObject({
            tag: 'Yaml-Socks',
            type: 'socks',
            server: 'example.com',
            server_port: 1080,
            username: 'alice',
            password: 'pw'
        });
    });
});

describe('socks node in live endpoints', () => {
    it('GET /singbox includes the socks outbound', async () => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(SOCKS_LINK)}`);
        expect(res.status).toBe(200);
        const json = await res.json();
        const outbound = json.outbounds.find(o => o?.tag === 'URnetwork-US-Test');
        expect(outbound).toMatchObject({
            type: 'socks',
            server: 'fireside.example.com',
            server_port: 7135,
            username: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        });
    });

    it('GET /clash includes the socks proxy', async () => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(SOCKS_LINK)}`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('URnetwork-US-Test');
        expect(text).toContain('fireside.example.com');
    });
});

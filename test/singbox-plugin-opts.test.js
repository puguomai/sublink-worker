import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

/**
 * sing-box types Shadowsocks plugin_opts as a string, while Clash carries it
 * as an object ({mode, host}). Passing the object through made sing-box
 * reject the whole config:
 * "decode config: outbounds[2].plugin_opts: json: cannot unmarshal object
 * into Go value of type string" (NekoBox, GLaDOS obfs nodes).
 */
describe('SingboxConfigBuilder plugin_opts', () => {
    it('serializes obfs plugin-opts object to a string', () => {
        const converted = SingboxConfigBuilder.prototype.convertProxy({
            tag: 'Fast-B1-1',
            type: 'shadowsocks',
            server: 'example.com',
            server_port: 8388,
            method: 'aes-256-gcm',
            password: 'test-password',
            plugin: 'obfs',
            plugin_opts: { mode: 'tls', host: 'example.com:8388' }
        });

        expect(converted.plugin_opts).toBe('obfs=tls;obfs-host=example.com:8388');
    });

    it('serializes v2ray-plugin plugin-opts object to a string', () => {
        const converted = SingboxConfigBuilder.prototype.convertProxy({
            tag: 'SS-V2Ray-WS',
            type: 'shadowsocks',
            server: 'example.com',
            server_port: 443,
            method: 'chacha20-ietf-poly1305',
            password: 'test-password',
            plugin: 'v2ray-plugin',
            plugin_opts: { mode: 'websocket', tls: true, host: 'example.com', path: '/v2ray' }
        });

        expect(converted.plugin_opts).toBe('mode=websocket;tls;host=example.com;path=/v2ray');
    });

    it('keeps string plugin_opts as-is', () => {
        const converted = SingboxConfigBuilder.prototype.convertProxy({
            tag: 'SS-String',
            type: 'shadowsocks',
            server: 'example.com',
            server_port: 8388,
            method: 'aes-256-gcm',
            password: 'test-password',
            plugin: 'obfs',
            plugin_opts: 'obfs=tls;obfs-host=example.com'
        });

        expect(converted.plugin_opts).toBe('obfs=tls;obfs-host=example.com');
    });

    it('leaves proxies without plugin_opts untouched', () => {
        const converted = SingboxConfigBuilder.prototype.convertProxy({
            tag: 'SS-Plain',
            type: 'shadowsocks',
            server: 'example.com',
            server_port: 8388,
            method: 'aes-256-gcm',
            password: 'test-password'
        });

        expect(converted).not.toHaveProperty('plugin_opts');
    });

    it('emits string plugin_opts for obfs SS nodes from Clash YAML input', async () => {
        const input = `proxies:
  - name: Fast-B1-1
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: test-password
    plugin: obfs
    plugin-opts:
      mode: tls
      host: example.com:8388`;

        const builder = new SingboxConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'sing-box/1.12');
        const config = await builder.build();
        const outbound = config.outbounds.find(item => item.tag === 'Fast-B1-1');

        expect(outbound).toBeDefined();
        expect(typeof outbound.plugin_opts).toBe('string');
        expect(outbound.plugin_opts).toBe('obfs=tls;obfs-host=example.com:8388');
        // The whole config must survive a JSON round-trip with no object plugin_opts
        const roundTripped = JSON.parse(JSON.stringify(config));
        const bad = roundTripped.outbounds.filter(o => typeof o.plugin_opts === 'object');
        expect(bad).toEqual([]);
    });
});

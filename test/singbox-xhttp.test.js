import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';

/**
 * sing-box has no xhttp transport in any version — only http, ws, quic,
 * grpc and httpupgrade. A single xhttp outbound makes sing-box reject the
 * whole config:
 * "decode config: outbounds[67].transport: unknown transport type: xhttp"
 * (NekoBox, selinux VLESS nodes). XHTTP is an Xray-core transport, so the
 * fix is to leave these nodes out of the Sing-Box output entirely; the
 * Clash output keeps them (mihomo 1.19.22+ supports xhttp).
 */
describe('SingboxConfigBuilder xhttp transport', () => {
    const xhttpVless = 'vless://11111111-1111-1111-1111-111111111111@example.com:443?encryption=none&security=tls&sni=example.com&type=xhttp&path=%2F&host=example.com#XHTTP-Node';
    const wsVless = 'vless://22222222-2222-2222-2222-222222222222@example.com:443?encryption=none&security=tls&sni=example.com&type=ws&path=%2Fws&host=example.com#WS-Node';
    const tcpVless = 'vless://33333333-3333-3333-3333-333333333333@example.com:443?encryption=none&security=tls&sni=example.com#TCP-Node';
    const ssNode = 'ss://YWVzLTI1Ni1nY206dGVzdC1wYXNzd29yZA@example.com:8388#SS-Node';

    it('drops xhttp-transport proxies in convertProxy', () => {
        expect(SingboxConfigBuilder.prototype.convertProxy({
            tag: 'XHTTP-Node',
            type: 'vless',
            server: 'example.com',
            server_port: 443,
            uuid: '11111111-1111-1111-1111-111111111111',
            transport: { type: 'xhttp', path: '/' }
        })).toBeNull();

        // Clash YAML input carries xhttp as `network` with no transport object
        expect(SingboxConfigBuilder.prototype.convertProxy({
            tag: 'XHTTP-Yaml',
            type: 'vless',
            server: 'example.com',
            server_port: 443,
            uuid: '11111111-1111-1111-1111-111111111111',
            network: 'xhttp'
        })).toBeNull();
    });

    it('excludes xhttp VLESS nodes from the Sing-Box output', async () => {
        const input = [xhttpVless, wsVless, tcpVless, ssNode].join('\n');

        const builder = new SingboxConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'sing-box/1.12');
        const config = await builder.build();

        expect(config.outbounds.find(item => item.tag === 'XHTTP-Node')).toBeUndefined();
        // No outbound may carry an xhttp transport anywhere in the config
        const roundTripped = JSON.parse(JSON.stringify(config));
        const bad = roundTripped.outbounds.filter(o => o.transport?.type === 'xhttp' || o.network === 'xhttp');
        expect(bad).toEqual([]);
        // No selector/urltest group may reference the skipped node
        const groups = roundTripped.outbounds.filter(o => Array.isArray(o.outbounds));
        expect(groups.length).toBeGreaterThan(0);
        groups.forEach(group => {
            expect(group.outbounds).not.toContain('XHTTP-Node');
        });
    });

    it('keeps ws, tcp and Shadowsocks nodes in the Sing-Box output', async () => {
        const input = [xhttpVless, wsVless, tcpVless, ssNode].join('\n');

        const builder = new SingboxConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'sing-box/1.12');
        const config = await builder.build();

        expect(config.outbounds.find(item => item.tag === 'WS-Node')).toBeDefined();
        expect(config.outbounds.find(item => item.tag === 'TCP-Node')).toBeDefined();
        expect(config.outbounds.find(item => item.tag === 'SS-Node')).toBeDefined();
    });

    it('excludes xhttp nodes from Clash YAML input as well', async () => {
        const input = `proxies:
  - name: XHTTP-Yaml
    type: vless
    server: example.com
    port: 443
    uuid: 11111111-1111-1111-1111-111111111111
    tls: true
    servername: example.com
    network: xhttp
    xhttp-opts:
      path: /
      host: example.com
  - name: WS-Yaml
    type: vless
    server: example.com
    port: 443
    uuid: 22222222-2222-2222-2222-222222222222
    tls: true
    servername: example.com
    network: ws
    ws-opts:
      path: /ws`;

        const builder = new SingboxConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'sing-box/1.12');
        const config = await builder.build();

        expect(config.outbounds.find(item => item.tag === 'XHTTP-Yaml')).toBeUndefined();
        expect(config.outbounds.find(item => item.tag === 'WS-Yaml')).toBeDefined();
    });

    it('keeps the xhttp node unchanged in the Clash output', async () => {
        const input = [xhttpVless, wsVless].join('\n');

        const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
        const built = yaml.load(await builder.build());

        const node = (built.proxies || []).find(p => p.name === 'XHTTP-Node');
        expect(node).toBeDefined();
        expect(node.network).toBe('xhttp');
        expect((built.proxies || []).find(p => p.name === 'WS-Node')).toBeDefined();
    });
});

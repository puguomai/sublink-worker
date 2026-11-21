import { parseServerInfo } from '../../utils.js';

function decode(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * Parse a SOCKS5 share link.
 * Format: socks://[username[:password]@]host:port[#name]
 * The `socks5://` scheme is accepted as an alias.
 *
 * The fragment is stripped first: parseUrlParams only recovers the name
 * when the link carries a query string, and socks links normally have
 * none, so the #name would otherwise stay glued to the server part.
 * An empty password (e.g. `socks://token:@host:port`) is omitted rather
 * than emitted as an empty string, so clients do not send a blank
 * password. `version: '5'` is set explicitly because sing-box defaults
 * it, and the Clash builder maps this object to its own shape.
 */
export function parseSocks(url) {
    const hashIndex = url.indexOf('#');
    const name = hashIndex === -1 ? '' : decode(url.slice(hashIndex + 1));
    const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const rest = withoutFragment.split('://')[1] || '';

    const atIndex = rest.lastIndexOf('@');
    let userinfo = '';
    let serverInfo = rest;
    if (atIndex !== -1) {
        userinfo = rest.slice(0, atIndex);
        serverInfo = rest.slice(atIndex + 1);
    }

    const { host, port } = parseServerInfo(serverInfo);
    if (!host || !port) {
        return undefined;
    }

    const result = {
        type: 'socks',
        tag: name || 'SOCKS5',
        server: host,
        server_port: port,
        version: '5'
    };

    if (userinfo) {
        const colonIndex = userinfo.indexOf(':');
        const username = colonIndex === -1 ? userinfo : userinfo.slice(0, colonIndex);
        const password = colonIndex === -1 ? '' : userinfo.slice(colonIndex + 1);
        if (username) {
            result.username = decode(username);
        }
        if (password) {
            result.password = decode(password);
        }
    }

    return result;
}

import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import crypto from 'crypto';
import https from 'https';

// Standard HTTPS Agent options to force IPv4 and fix handshake drops
export const agentOptions = {
  family: 4, // Force IPv4 to prevent SSL EPROTO handshake failures on Hugging Face
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 256,
  minVersion: 'TLSv1.2' as const,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
};

// Standard Agent when no proxy is used
export const defaultHttpsAgent = new https.Agent(agentOptions);

/**
 * Returns the appropriate connection agent (HTTP/HTTPS or SOCKS) based on proxy URL protocol.
 * Forwards SSL and connection options to ensure reliable handshakes.
 */
export const getProxyAgent = (proxyUrl: string): any => {
  if (!proxyUrl) return defaultHttpsAgent;

  let formattedUrl = proxyUrl.trim();
  // If protocol is missing, default to http://
  if (!/^https?:\/\//i.test(formattedUrl) && !/^socks/i.test(formattedUrl)) {
    formattedUrl = `http://${formattedUrl}`;
  }

  try {
    if (/^socks/i.test(formattedUrl)) {
      return new SocksProxyAgent(formattedUrl, agentOptions);
    }
    return new HttpsProxyAgent(formattedUrl, agentOptions);
  } catch (err: any) {
    console.error(`❌ Failed to create proxy agent for URL "${proxyUrl}":`, err.message);
    return defaultHttpsAgent;
  }
};

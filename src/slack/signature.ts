import crypto from 'crypto';

export interface VerifySlackSignatureOptions {
  signingSecret: string;
  requestSignature: string;
  timestamp: string;
  rawBody: string;
}

/**
 * Verifies that an incoming HTTP request originated from Slack using HMAC-SHA256.
 * Adheres strictly to Slack's official signature verification protocol:
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(options: VerifySlackSignatureOptions): { valid: boolean; error?: string } {
  const { signingSecret, requestSignature, timestamp, rawBody } = options;

  if (!signingSecret) {
    return { valid: false, error: 'Missing SLACK_SIGNING_SECRET' };
  }

  if (!requestSignature || !timestamp) {
    return { valid: false, error: 'Missing Slack signature or timestamp headers' };
  }

  // Check for replay attacks: verify timestamp is within 5 minutes (300 seconds)
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > 300) {
    return { valid: false, error: 'Request timestamp is expired or invalid (possible replay attack)' };
  }

  // Construct signature base string: "v0:${timestamp}:${rawBody}"
  const sigBasestring = `v0:${timestamp}:${rawBody}`;

  // Calculate HMAC-SHA256 hash using the signing secret
  const mySignature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex')}`;

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(requestSignature, 'utf8');
    const mySignatureBuffer = Buffer.from(mySignature, 'utf8');

    if (signatureBuffer.length !== mySignatureBuffer.length) {
      return { valid: false, error: 'Signature length mismatch' };
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, mySignatureBuffer);
    if (!isValid) {
      return { valid: false, error: 'Slack signature mismatch' };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Signature verification error: ${err.message}` };
  }
}

/**
 * Helper to generate valid signatures (primarily used in automated test suites).
 */
export function generateTestSlackSignature(signingSecret: string, timestamp: number, rawBody: string): string {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  return `v0=${crypto.createHmac('sha256', signingSecret).update(sigBasestring, 'utf8').digest('hex')}`;
}

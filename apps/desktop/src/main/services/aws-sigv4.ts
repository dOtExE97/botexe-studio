// aws-sigv4.ts — minimale AWS Signature Version 4 für POST-Requests
// (für Amazon Polly, ohne das schwere aws-sdk). Testbar gegen die
// offiziellen AWS-Test-Vektoren (aws-sig-v4-test-suite).
import crypto from 'node:crypto';

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

export interface SigV4Input {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  host: string;
  method: string;
  path: string;
  body: string;
  /** ISO-Basic-Timestamp YYYYMMDDTHHMMSSZ — für Tests fix, sonst aus Date. */
  amzDate: string;
  /** Zusätzliche Header, die signiert werden sollen (lowercase keys). */
  extraHeaders?: Record<string, string>;
}

export interface SignedRequest {
  headers: Record<string, string>;
}

/** Signiert einen Request und liefert die zu setzenden Header (inkl. Authorization). */
export function signRequest(input: SigV4Input): SignedRequest {
  const dateStamp = input.amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);

  const headers: Record<string, string> = {
    host: input.host,
    'x-amz-date': input.amzDate,
    ...(input.extraHeaders ?? {}),
  };

  // Canonical headers: alphabetisch nach lowercase key, value getrimmt.
  const sortedKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k]?.trim() ?? ''}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    input.method,
    input.path,
    '', // query string (leer für unsere POSTs)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    algorithm,
    input.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `${algorithm} Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { headers: { ...headers, Authorization: authorization } };
}

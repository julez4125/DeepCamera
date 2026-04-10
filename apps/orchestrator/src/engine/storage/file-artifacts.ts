import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface FileFingerprint {
  bytes: number;
  checksum: string;
}

export async function fingerprintFile(filePath: string): Promise<FileFingerprint> {
  return new Promise<FileFingerprint>((resolve, reject) => {
    const hash = createHash('sha256');
    let bytes = 0;
    const stream = createReadStream(filePath);

    stream.on('data', (chunk: string | Buffer) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytes += buffer.length;
      hash.update(buffer);
    });

    stream.on('error', reject);
    stream.on('end', () => {
      resolve({
        bytes,
        checksum: hash.digest('hex'),
      });
    });
  });
}

export async function copyFileAndFingerprint(
  sourcePath: string,
  destinationPath: string
): Promise<FileFingerprint> {
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  return fingerprintFile(destinationPath);
}

export async function writeJsonArtifact(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

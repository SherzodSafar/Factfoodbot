import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

/** Telegram fayl havolasidan baytlarni yuklab oladi. */
export async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Videodan teng oraliqlarda `count` ta kadr (JPEG) ajratadi.
 * Qaytaradi: base64 satrlar massivi.
 */
export async function extractFrames(videoBuffer, durationSec, count = 6) {
  const dir = await mkdtemp(path.join(tmpdir(), 'kino-'));
  try {
    const input = path.join(dir, 'input.mp4');
    await writeFile(input, videoBuffer);

    const duration = durationSec && durationSec > 0 ? durationSec : 10;
    // Boshidan va oxiridan biroz chetlab, oraliqni teng bo'lamiz
    const times = Array.from({ length: count }, (_, i) =>
      Math.max(0, (duration * (i + 0.5)) / count),
    );

    const frames = [];
    for (const [i, t] of times.entries()) {
      const out = path.join(dir, `f${i}.jpg`);
      try {
        await run(ffmpegPath, [
          '-v', 'error',
          '-ss', t.toFixed(2),
          '-i', input,
          '-frames:v', '1',
          '-vf', "scale='min(1024,iw)':-2",
          '-q:v', '4',
          '-y', out,
        ], { timeout: 30_000 });
        frames.push((await readFile(out)).toString('base64'));
      } catch {
        // Ba'zi vaqt nuqtalarida kadr bo'lmasligi mumkin — o'tkazib yuboramiz
      }
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

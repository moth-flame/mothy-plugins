// source: commandiq-dev2/scripts/demo/lib/ffmpeg.mjs
// vendored 2026-06-29; canonical source is commandiq-dev2/scripts/demo
/**
 * ffmpeg.mjs — assembly helpers for the CommandMRO demo video.
 *
 * The pipeline is: capture per-beat .webm → normalize each to identical
 * 1920x1080/30fps/yuv420p mp4 (so concat is clean) → mux a per-beat VO mp3 →
 * concat-demux all beats into the final film.
 *
 * Every helper shells out to the system ffmpeg/ffprobe (7.1 at
 * /usr/local/bin). We keep the EXACT invocation in a comment above each
 * function so the assemble script (and future-me) can reason about the flags.
 *
 * All functions return a Promise. They reject on a non-zero exit and surface
 * the tail of stderr so failures are debuggable.
 */
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG_BIN || '/usr/local/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN || '/usr/local/bin/ffprobe';

const CANVAS = { w: 1920, h: 1080, fps: 30 };
const DEFAULT_BG = '#07111f'; // near-black demo canvas for pillar/letterbox

/** Run a binary, capture stderr, resolve stdout, reject with stderr tail. */
function run(bin, args, { capture = 'stdout' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(capture === 'stderr' ? err : out);
      else {
        const tail = err.split('\n').slice(-12).join('\n');
        reject(new Error(`${path.basename(bin)} exited ${code}\n${tail}`));
      }
    });
  });
}

/** Convert a "#rrggbb" string to ffmpeg's 0xRRGGBB color literal. */
function toFfColor(c) {
  if (!c) return '0x070A0F';
  const hex = c.replace('#', '');
  return `0x${hex}`;
}

/**
 * probeDuration(file) -> seconds (float)
 *
 *   ffprobe -v error -show_entries format=duration \
 *           -of default=noprint_wrappers=1:nokey=1 <file>
 */
export async function probeDuration(file) {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const sec = parseFloat(String(out).trim());
  if (!Number.isFinite(sec)) throw new Error(`probeDuration: could not parse duration of ${file} (got "${out}")`);
  return sec;
}

/**
 * normalizeSegment(inWebm, outMp4, opts)
 *
 * Scale+pad every input onto the shared 1920x1080 canvas at a fixed 30fps,
 * re-encoded libx264/yuv420p, with a silent AAC track. Identical params across
 * all segments is what makes the concat demuxer safe. Portrait/tablet inputs
 * pillarbox onto the dark `bg` canvas.
 *
 *   ffmpeg -y -i <in> \
 *     -vf "scale=W:H:force_original_aspect_ratio=decrease,
 *          pad=W:H:(ow-iw)/2:(oh-ih)/2:<bg>,setsar=1,fps=FPS,format=yuv420p" \
 *     -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
 *     -shortest -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
 *     -c:a aac -b:a 192k -ar 48000 -movflags +faststart <out>
 */
export async function normalizeSegment(inWebm, outMp4, opts = {}) {
  const w = opts.w ?? CANVAS.w;
  const h = opts.h ?? CANVAS.h;
  const fps = opts.fps ?? CANVAS.fps;
  const bg = toFfColor(opts.bg ?? DEFAULT_BG);

  const vf = [
    `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:${bg}`,
    'setsar=1',
    `fps=${fps}`,
    'format=yuv420p',
  ].join(',');

  await run(FFMPEG, [
    '-y',
    '-i', inWebm,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-vf', vf,
    '-shortest',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    outMp4,
  ], { capture: 'stderr' });

  return outMp4;
}

/**
 * muxVo(segMp4, voMp3, outMp4)
 *
 * Replace the segment's (silent) audio with a per-beat VO mp3, padding the
 * SHORTER stream so the segment length == max(video, vo). No narration ever
 * gets clipped: if VO is longer than the captured video, we freeze the last
 * video frame (tpad); if video is longer, we pad the audio with silence (apad).
 *
 * IMPORTANT: we cannot rely on `-shortest` here, because BOTH streams are
 * infinitely padded (tpad clones the last frame, apad appends silence), so
 * there is no finite stream for `-shortest` to bound against — it would run
 * to the tpad limit. Instead we probe both inputs in Node, compute
 * target = max(video, vo) + a small tail, and pass an explicit `-t`.
 *
 *   target = max(probe(seg.mp4), probe(vo.mp3)) + 0.15
 *   ffmpeg -y -i <seg.mp4> -i <vo.mp3> \
 *     -filter_complex \
 *       "[0:v]tpad=stop_mode=clone:stop_duration=<target>[v]; \
 *        [1:a]apad[a]" \
 *     -map "[v]" -map "[a]" -t <target> \
 *     -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
 *     -c:a aac -b:a 192k -ar 48000 -movflags +faststart <out>
 *
 * The 0.15s tail keeps the final narrated word from being cut flush.
 */
export async function muxVo(segMp4, voMp3, outMp4) {
  const [vidDur, voDur] = await Promise.all([
    probeDuration(segMp4),
    probeDuration(voMp3),
  ]);
  const target = Math.max(vidDur, voDur) + 0.15;
  const t = target.toFixed(3);

  await run(FFMPEG, [
    '-y',
    '-i', segMp4,
    '-i', voMp3,
    '-filter_complex',
    `[0:v]tpad=stop_mode=clone:stop_duration=${t}[v];[1:a]apad[a]`,
    '-map', '[v]', '-map', '[a]',
    '-t', t,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    outMp4,
  ], { capture: 'stderr' });

  return outMp4;
}

/**
 * concatDemuxer(orderedMp4s, outMp4)
 *
 * Stitch the ordered, already-normalized segments via the concat DEMUXER
 * (not the filter), which is fast + lossless-ish when every input shares
 * identical codec params. We still re-encode the output once to a clean
 * crf18/aac192k master so the final file is uniformly seekable.
 *
 *   # list.txt:
 *   #   file '/abs/path/beat1.mp4'
 *   #   file '/abs/path/beat2.mp4'
 *   ffmpeg -y -f concat -safe 0 -i list.txt \
 *     -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
 *     -c:a aac -b:a 192k -ar 48000 -movflags +faststart <out>
 */
export async function concatDemuxer(orderedMp4s, outMp4) {
  if (!Array.isArray(orderedMp4s) || orderedMp4s.length === 0) {
    throw new Error('concatDemuxer: need a non-empty array of mp4 paths');
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'demo-concat-'));
  const listPath = path.join(dir, 'list.txt');
  // ffmpeg concat list requires forward-slashed absolute paths with single
  // quotes; escape any embedded single quotes per ffmpeg's rules.
  const body = orderedMp4s
    .map((p) => `file '${path.resolve(p).replace(/'/g, `'\\''`)}'`)
    .join('\n');
  await writeFile(listPath, body + '\n', 'utf8');

  try {
    await run(FFMPEG, [
      '-y',
      '-f', 'concat', '-safe', '0',
      '-i', listPath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      outMp4,
    ], { capture: 'stderr' });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  return outMp4;
}

/**
 * detectSplashHead(file, opts) -> { trimAt: seconds, confident: boolean }
 *
 * The CommandIQ app shows a near-uniform dark "Loading assessment frameworks…"
 * splash on boot and on some in-app navigations (e.g. /lxp → /). It is
 * non-value-added and must never survive into a final cut. The most reliable
 * frame-level signal for it is a run of near-static, low-motion frames at the
 * HEAD of a clip, followed by the first frame where the real UI paints in (a
 * large scene change).
 *
 * We run ffmpeg's `select='gt(scene,THRESH)'` over the first `window` seconds
 * and read `showinfo`'s pts_time for the first big scene-cut. That timestamp is
 * where the splash gives way to real content — the head-trim point. If no big
 * cut is found inside the window (the clip never had a splash, OR the whole
 * window is the splash), we return trimAt:0 + confident:false so the caller can
 * decide rather than blindly trimming.
 *
 *   ffmpeg -ss 0 -t <window> -i <file> \
 *     -vf "select='gt(scene,<thresh>)',showinfo" -an -f null -
 *   → parse the FIRST "pts_time:<t>" from showinfo on stderr.
 *
 * opts:
 *   window      — seconds from the head to scan (default 4)
 *   thresh      — scene-change score 0..1 that counts as "UI painted" (0.35)
 *   maxTrim     — never report a trim point later than this (default 3.5s) so a
 *                 mis-detect can't eat real content
 */
export async function detectSplashHead(file, opts = {}) {
  const window = opts.window ?? 4;
  const thresh = opts.thresh ?? 0.35;
  const maxTrim = opts.maxTrim ?? 3.5;

  const err = await run(
    FFMPEG,
    [
      '-hide_banner',
      '-ss', '0', '-t', String(window),
      '-i', file,
      '-vf', `select='gt(scene,${thresh})',showinfo`,
      '-an', '-f', 'null', '-',
    ],
    { capture: 'stderr' },
  );

  // showinfo prints one line per selected (post-cut) frame; the first one is
  // the first frame after the splash gives way to real UI.
  const m = err.match(/pts_time:([\d.]+)/);
  if (!m) return { trimAt: 0, confident: false };
  const t = parseFloat(m[1]);
  if (!Number.isFinite(t) || t <= 0) return { trimAt: 0, confident: false };
  if (t > maxTrim) return { trimAt: 0, confident: false };
  return { trimAt: t, confident: true };
}

/**
 * trimHead(inFile, outFile, seconds)
 *
 * Drop the first `seconds` of a clip (re-stamping PTS to 0) — used to strip a
 * leading CommandIQ loading splash that slipped into a capture. Re-encode so
 * the output stays a clean, seekable, identical-params segment.
 *
 *   ffmpeg -y -ss <seconds> -i <in> \
 *     -vf "setpts=PTS-STARTPTS" -af "asetpts=PTS-STARTPTS" \
 *     -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
 *     -c:a aac -b:a 192k -ar 48000 -movflags +faststart <out>
 */
export async function trimHead(inFile, outFile, seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) {
    throw new Error(`trimHead: seconds must be > 0 (got ${seconds})`);
  }
  await run(
    FFMPEG,
    [
      '-y',
      '-ss', s.toFixed(3),
      '-i', inFile,
      '-vf', 'setpts=PTS-STARTPTS',
      '-af', 'asetpts=PTS-STARTPTS',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      outFile,
    ],
    { capture: 'stderr' },
  );
  return outFile;
}

/**
 * trimSplashHead(inFile, outFile, opts) -> { trimmed: boolean, trimAt: number }
 *
 * Convenience wrapper: detect a leading splash and, if confidently found,
 * head-trim it; otherwise copy-through unchanged. Use this in the assembly
 * pass as a belt-and-suspenders guard for mid-beat navigations where the
 * splash slips in even though capture waited for the post-splash element.
 */
export async function trimSplashHead(inFile, outFile, opts = {}) {
  const { trimAt, confident } = await detectSplashHead(inFile, opts);
  if (!confident || trimAt <= 0) {
    // Nothing to trim — normalize-copy so the output is still a clean segment.
    await run(
      FFMPEG,
      [
        '-y', '-i', inFile,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-movflags', '+faststart',
        outFile,
      ],
      { capture: 'stderr' },
    );
    return { trimmed: false, trimAt: 0 };
  }
  await trimHead(inFile, outFile, trimAt);
  return { trimmed: true, trimAt };
}

export const FFMPEG_DEFAULTS = { CANVAS, DEFAULT_BG, FFMPEG, FFPROBE };

export default {
  probeDuration,
  normalizeSegment,
  muxVo,
  concatDemuxer,
  detectSplashHead,
  trimHead,
  trimSplashHead,
  FFMPEG_DEFAULTS,
};

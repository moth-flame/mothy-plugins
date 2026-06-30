// source: commandiq-dev2/scripts/demo/assemble.mjs
// vendored 2026-06-29; canonical source is commandiq-dev2/scripts/demo
/**
 * assemble.mjs — final assembly of the CommandMRO demo video.
 *
 * Pipeline:
 *   1. Per-beat pacing/sync: probe video + VO length, decide freeze-pad vs
 *      speed-up so the VO is never clipped and dead air is minimal, then mux
 *      the per-beat VO (leading 0.2s + trailing silence) over the paced video.
 *      Every beat is normalized to identical params (1920x1080/30fps/yuv420p/
 *      h264/aac48k/setsar=1) so concat is clean. Portrait beats pillarbox onto
 *      a dark canvas; beat-05 is a still held for the VO length with fades.
 *   2. Concat — hard-cut concat demuxer (segments share identical params).
 *   3. GATE C — ffprobe assertions + per-beat pacing report.
 *   4. Thumbnails — one mid-frame per beat.
 *
 * Run: node assemble.mjs
 *
 * Inputs live in <scratchpad>/demo/{segments,vo}; outputs in
 * <scratchpad>/demo/{seg-mp4,out}. The scratchpad dir is hard-coded to the
 * session path (override with DEMO_DIR env).
 */
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { probeDuration } from './lib/ffmpeg.mjs';

const FFMPEG = process.env.FFMPEG_BIN || '/usr/local/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN || '/usr/local/bin/ffprobe';

const DEMO_DIR =
  process.env.DEMO_DIR ||
  '/private/tmp/claude-501/-Users-rich-Documents-GitHub-commandiq-dev2/2ace0441-5956-4b9b-a85d-2719a0023233/scratchpad/demo';

const SEG_DIR = path.join(DEMO_DIR, 'segments');
const VO_DIR = path.join(DEMO_DIR, 'vo');
const SEGMP4_DIR = path.join(DEMO_DIR, 'seg-mp4');
const OUT_DIR = path.join(DEMO_DIR, 'out');
const THUMB_DIR = path.join(OUT_DIR, 'thumbs');

const W = 1920;
const H = 1080;
const FPS = 30;
const BG = '0x07111f';
const MAX_SPEED = 1.7; // setpts speed-up cap
const LEAD = 0.2; // leading silence before VO so first word isn't flush

// FINAL ORDER: 1, 2, 2b, 3, 4, 5, 6, 7, 8.
// Each beat: id (vo key + label), video source (or still), portrait flag.
const BEATS = [
  { id: '1', label: 'beat-01', video: 'beat-01.webm', portrait: false },
  { id: '2', label: 'beat-02', video: 'beat-02.webm', portrait: false },
  { id: '2b', label: 'beat-02b', video: 'beat-02b.webm', portrait: false },
  { id: '3', label: 'beat-03', video: 'beat-03.webm', portrait: true },
  { id: '4', label: 'beat-04', video: 'beat-04.webm', portrait: true },
  { id: '5', label: 'beat-05', still: 'beat-05.png', portrait: false },
  { id: '6', label: 'beat-06', video: 'beat-06.webm', portrait: false },
  { id: '7', label: 'beat-07', video: 'beat-07.webm', portrait: false },
  { id: '8', label: 'beat-08', video: 'beat-08.webm', portrait: true },
];

/** Run a binary; resolve stderr (ffmpeg writes progress there), reject with tail. */
function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(err);
      else reject(new Error(`${path.basename(bin)} exited ${code}\n${err.split('\n').slice(-15).join('\n')}`));
    });
  });
}

/** ffprobe a single numeric/string entry. */
async function probe(file, entry, stream = null) {
  const args = ['-v', 'error'];
  if (stream) args.push('-select_streams', stream);
  args.push('-show_entries', entry, '-of', 'default=noprint_wrappers=1:nokey=1', file);
  return new Promise((resolve, reject) => {
    const c = spawn(FFPROBE, args);
    let o = '';
    c.stdout.on('data', (d) => (o += d.toString()));
    c.on('error', reject);
    c.on('close', () => resolve(o.trim()));
  });
}

/** mean_volume in dB via the volumedetect filter (null muxer). */
async function meanVolume(file) {
  const err = await run(FFMPEG, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? parseFloat(m[1]) : NaN;
}

/**
 * Pillarbox/letterbox onto the shared canvas. Returns the video-filter prefix
 * that lands ANY input (portrait or landscape) as 1920x1080 with dark bars.
 */
function canvasVf() {
  return [
    `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG}`,
    'setsar=1',
  ].join(',');
}

/**
 * Build one normalized, VO-muxed beat.mp4.
 *
 * Sync rule:
 *   videoLen <= voLen + 1.0  → freeze-pad last frame to voLen + 0.5 (tpad)
 *   videoLen >  voLen + 1.0  → speed up via setpts/factor to voLen + 1.5
 *                              (factor = videoLen/(voLen+1.5)), capped 1.7;
 *                              if >1.7 needed, factor=1.7 and trim the tail.
 * finalLen is the resulting video length; VO gets LEAD silence in front and
 * apad silence behind so it fills finalLen exactly and never clips.
 */
async function buildBeat(beat) {
  const voPath = path.join(VO_DIR, `vo-${beat.id}.mp3`);
  const voLen = await probeDuration(voPath);
  const outPath = path.join(SEGMP4_DIR, `${beat.label}.mp4`);

  // --- determine the raw video length and source clip ----------------------
  let videoLen;
  if (beat.still) {
    // The still has no duration; we hold it for voLen + LEAD + 0.5 (matches
    // the freeze-pad target so the report reads consistently).
    videoLen = 0; // sentinel: treated as "much shorter than VO" → freeze branch
  } else {
    videoLen = await probeDuration(path.join(SEG_DIR, beat.video));
  }

  // --- decide pacing --------------------------------------------------------
  let mode; // 'freeze' | 'speed'
  let factor = 1; // setpts speed factor
  let finalLen;
  let trimmed = false;

  if (beat.still) {
    mode = 'still';
    factor = 1;
    finalLen = LEAD + voLen + 0.5;
  } else if (videoLen <= voLen + 1.0) {
    mode = 'freeze';
    // video runs to voLen + 0.5 (then we offset the whole thing by LEAD).
    finalLen = LEAD + voLen + 0.5;
  } else {
    mode = 'speed';
    const want = voLen + 1.5;
    factor = videoLen / want;
    if (factor > MAX_SPEED) {
      factor = MAX_SPEED;
      trimmed = true;
    }
    // After setpts=PTS/factor the clip is videoLen/factor long; if we capped,
    // it's still longer than `want` so we trim with -t. We then offset VO by
    // LEAD. finalLen = sped length (+LEAD), trimmed to want+LEAD when capped.
    const spedLen = videoLen / factor;
    finalLen = LEAD + Math.min(spedLen, want);
  }

  const fl = finalLen.toFixed(3);

  // --- assemble the filter graph -------------------------------------------
  // Video chain produces [v]; audio chain produces [a]; both exactly finalLen.
  // Audio: adelay LEAD ms in front, apad behind, then -t finalLen clamp.
  const leadMs = Math.round(LEAD * 1000);
  const aChain = `[1:a]adelay=${leadMs}|${leadMs},apad[a]`;

  if (beat.still) {
    // Loop the still as a video input, hold for finalLen, fade in/out 0.4s.
    const fadeOut = (finalLen - 0.4).toFixed(3);
    const vChain =
      `[0:v]${canvasVf()},fps=${FPS},format=yuv420p,` +
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut}:d=0.4,trim=duration=${fl},setpts=PTS-STARTPTS[v]`;
    await run(FFMPEG, [
      '-y',
      '-loop', '1', '-framerate', String(FPS), '-t', fl, '-i', path.join(SEG_DIR, beat.still),
      '-i', voPath,
      '-filter_complex', `${vChain};${aChain}`,
      '-map', '[v]', '-map', '[a]',
      '-t', fl,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      outPath,
    ]);
  } else {
    let vChain;
    if (mode === 'freeze') {
      // Pillarbox, then clone the last frame out to finalLen (tpad target is
      // the absolute stop duration, i.e. finalLen).
      vChain =
        `[0:v]${canvasVf()},fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS,` +
        `tpad=stop_mode=clone:stop_duration=${fl},trim=duration=${fl},setpts=PTS-STARTPTS[v]`;
    } else {
      // Speed up: setpts=PTS/factor, then clamp to finalLen (handles the
      // capped/trimmed case). Re-stamp fps after retiming.
      vChain =
        `[0:v]${canvasVf()},setpts=PTS/${factor.toFixed(6)}*1,` +
        `fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS,` +
        `tpad=stop_mode=clone:stop_duration=${fl},trim=duration=${fl},setpts=PTS-STARTPTS[v]`;
    }
    await run(FFMPEG, [
      '-y',
      '-i', path.join(SEG_DIR, beat.video),
      '-i', voPath,
      '-filter_complex', `${vChain};${aChain}`,
      '-map', '[v]', '-map', '[a]',
      '-t', fl,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      outPath,
    ]);
  }

  const actualLen = await probeDuration(outPath);
  return {
    label: beat.label,
    id: beat.id,
    mode,
    videoLen: beat.still ? null : videoLen,
    voLen,
    factor: mode === 'speed' ? factor : 1,
    capped: trimmed,
    finalLen: actualLen,
    out: outPath,
  };
}

/** Hard-cut concat via the demuxer (identical params across all segments). */
async function concat(orderedMp4s, outPath) {
  const listPath = path.join(SEGMP4_DIR, 'concat-list.txt');
  const body = orderedMp4s.map((p) => `file '${path.resolve(p)}'`).join('\n');
  await writeFile(listPath, body + '\n', 'utf8');
  await run(FFMPEG, [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    outPath,
  ]);
}

async function main() {
  await mkdir(SEGMP4_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(THUMB_DIR, { recursive: true });

  console.log('=== STEP 1: per-beat pacing + VO mux ===');
  const results = [];
  for (const beat of BEATS) {
    process.stdout.write(`  ${beat.label} (vo-${beat.id})... `);
    const r = await buildBeat(beat);
    results.push(r);
    console.log(
      `${r.mode} factor=${r.factor.toFixed(3)} final=${r.finalLen.toFixed(2)}s${r.capped ? ' [CAPPED]' : ''}`,
    );
  }

  console.log('\n=== STEP 2: concat (hard-cut demuxer) ===');
  const finalOut = path.join(OUT_DIR, 'commandmro-demo.mp4');
  await concat(results.map((r) => r.out), finalOut);
  console.log(`  -> ${finalOut}`);

  console.log('\n=== STEP 3: GATE C ===');
  const width = await probe(finalOut, 'stream=width', 'v:0');
  const height = await probe(finalOut, 'stream=height', 'v:0');
  const vcodec = await probe(finalOut, 'stream=codec_name', 'v:0');
  const pix = await probe(finalOut, 'stream=pix_fmt', 'v:0');
  const acodec = await probe(finalOut, 'stream=codec_name', 'a:0');
  const totalDur = await probeDuration(finalOut);
  const mv = await meanVolume(finalOut);

  const checks = [];
  const assert = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  };
  assert('resolution 1920x1080', Number(width) === W && Number(height) === H, `${width}x${height}`);
  assert('video codec h264', vcodec === 'h264', vcodec);
  assert('pixel format yuv420p', pix === 'yuv420p', pix);
  assert('audio codec aac', acodec === 'aac', acodec || '(none)');
  assert('has audio stream', !!acodec, acodec || '(none)');
  assert('mean_volume > -50dB (not silent)', Number.isFinite(mv) && mv > -50, `${mv} dB`);
  assert(
    'duration in 3:45–4:45',
    totalDur >= 225 && totalDur <= 285,
    `${Math.floor(totalDur / 60)}:${String(Math.round(totalDur % 60)).padStart(2, '0')} (${totalDur.toFixed(1)}s)`,
  );

  const gatePass = checks.every((c) => c.ok);

  console.log('\n=== Per-beat pacing table ===');
  console.log('  beat       mode    videoLen  voLen    factor  finalLen  capped');
  for (const r of results) {
    console.log(
      `  ${r.label.padEnd(10)} ${r.mode.padEnd(7)} ` +
        `${(r.videoLen == null ? 'still' : r.videoLen.toFixed(2) + 's').padEnd(9)} ` +
        `${(r.voLen.toFixed(2) + 's').padEnd(8)} ` +
        `${r.factor.toFixed(3).padEnd(7)} ` +
        `${(r.finalLen.toFixed(2) + 's').padEnd(9)} ` +
        `${r.capped ? 'YES' : '-'}`,
    );
  }

  console.log('\n=== STEP 4: thumbnails (mid-frame per beat) ===');
  for (const r of results) {
    const thumb = path.join(THUMB_DIR, `${r.label}.jpg`);
    const mid = (r.finalLen / 2).toFixed(2);
    await run(FFMPEG, ['-y', '-ss', mid, '-i', r.out, '-frames:v', '1', '-q:v', '3', thumb]);
    console.log(`  ${r.label}.jpg @ ${mid}s`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  final: ${finalOut}`);
  console.log(`  runtime: ${Math.floor(totalDur / 60)}:${String(Math.round(totalDur % 60)).padStart(2, '0')} (${totalDur.toFixed(1)}s)`);
  console.log(`  thumbs: ${THUMB_DIR}`);
  console.log(`  GATE C: ${gatePass ? 'PASS' : 'FAIL'}`);
  const cappedBeats = results.filter((r) => r.capped).map((r) => r.label);
  console.log(`  capped beats (VO too short / video too long): ${cappedBeats.length ? cappedBeats.join(', ') : 'none'}`);

  if (!gatePass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

// One decoded buffer per file, one fresh source per sound. No HTML-media autoplay races.
let context, master, musicGain, musicSource, engineGain, engineOscillator;
let loading = null, ready = false, muted = false, paused = true;
let alarmActive = false, alarmGain, alarmSource = null, alarmBuffer;
const banks = {
  shot: { files: ['laser-soft.mp3'], volume: .16 },
  empty: { files: ['empty-click.wav'], volume: .28 },
  lock: { files: ['lock-on.wav'], volume: .19 },
  shieldGlance: { files: ['shield-hard.wav'], volume: .19 },
  shieldHard: { files: ['shield-hard.wav'], volume: .24 },
  hit: { files: ['impact-1.mp3', 'impact-2.mp3', 'impact-3.mp3'], volume: .42 },
  // Match measured average levels to the quietest blast, without boosting any sample.
  explosion: { files: ['blast-1.mp3', 'blast-2.mp3', 'blast-3.mp3'], volume: .55, variantGains: [.52, .75, .6] },
  go: { files: ['go-bing.wav'], volume: .124775 },
  // Original force-field sweep; adjust only gain, preserving its tone.
  checkpoint: { files: ['checkpoint-pass.wav'], volume: .157083 },
  checkpointMiss: { files: ['checkpoint-miss.wav'], volume: .34 },
  reward: { files: ['reward.wav'], volume: .24 }
};
const activeSounds = new Set();
async function decode(file) {
  const url = new URL(`../../assets/audio/${file}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio file unavailable: ${file} (${response.status})`);
  return context.decodeAudioData(await response.arrayBuffer());
}
export async function initAudio() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = muted ? 0 : .8;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 8;
    master.connect(limiter).connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOscillator = context.createOscillator();
    engineOscillator.type = 'sine';
    engineOscillator.frequency.value = 48;
    engineOscillator.connect(engineGain).connect(master);
    engineOscillator.start();
    alarmGain = context.createGain();
    alarmGain.gain.value = .24;
    alarmGain.connect(master);
  }
  // Invoke resume in the actual click handler, before waiting for network/decoding.
  await context.resume();
  if (ready) return;
  if (!loading) {
    loading = (async () => {
      const [musicBuffer, warningBuffer] = await Promise.all([
        decode('orbit-arcade.mp3'),
        decode('warning-low.wav'),
        ...Object.values(banks).map(async bank => {
          bank.buffers = await Promise.all(bank.files.map(decode));
          bank.last = -1;
        })
      ]);
      // One low warning pulse, followed by silence. Loop on the audio clock,
      // not a timer, so repeats stay even and cannot stack on top of each other.
      alarmBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .95), context.sampleRate);
      alarmBuffer.copyToChannel(warningBuffer.getChannelData(0), 0);
      musicSource = context.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true;
      musicSource.connect(musicGain);
      musicSource.start();
      ready = true;
      updateMix();
    })().catch(error => { loading = null; throw error; });
  }
  await loading;
}
function updateMix() {
  if (!context) return;
  master.gain.setTargetAtTime(muted ? 0 : .8, context.currentTime, .03);
  musicGain.gain.setTargetAtTime(!paused ? .35 : 0, context.currentTime, .1);
  if (paused) engineGain.gain.setTargetAtTime(0, context.currentTime, .03);
  const shouldAlarm = alarmActive && ready && !paused && !muted;
  if (shouldAlarm && !alarmSource) {
    alarmSource = context.createBufferSource();
    alarmSource.buffer = alarmBuffer;
    alarmSource.loop = true;
    alarmSource.connect(alarmGain);
    alarmSource.start();
  } else if (!shouldAlarm && alarmSource) {
    alarmSource.stop();
    alarmSource.disconnect();
    alarmSource = null;
  }
}
export function setAlarm(value) {
  if (alarmActive === value) return;
  alarmActive = value;
  updateMix();
}
export function setMuted(value) { muted = value; updateMix(); }
export function setPaused(value) {
  paused = value;
  if (paused) for (const source of activeSounds) source.stop();
  updateMix();
}
export async function resumeAudio() {
  if (context && context.state !== 'running') await context.resume();
}
export async function suspendAudio() { if (context) await context.suspend(); }
export function updateEngine(speed) {
  if (!ready || paused) return;
  engineGain.gain.setTargetAtTime(.018 + speed * .00003, context.currentTime, .15);
  engineOscillator.frequency.setTargetAtTime(42 + speed * .08, context.currentTime, .2);
}
export function playEngineFailure(speed) {
  if (!ready || muted || context.state !== 'running') return;
  // A short falling motor tone with two soft dropouts; independent of the paused engine loop.
  const source = context.createOscillator(), gain = context.createGain();
  const now = context.currentTime;
  source.type = 'sine';
  source.frequency.setValueAtTime(42 + Math.min(speed, 1000) * .08, now);
  source.frequency.exponentialRampToValueAtTime(24, now + 1.2);
  gain.gain.setValueAtTime(.035, now);
  for (const [time, value] of [[.16, .012], [.24, .03], [.42, .008], [.51, .02], [1.2, .001]]) {
    gain.gain.exponentialRampToValueAtTime(value, now + time);
  }
  source.connect(gain).connect(master);
  activeSounds.add(source);
  source.onended = () => { activeSounds.delete(source); source.disconnect(); gain.disconnect(); };
  source.start(now);
  source.stop(now + 1.25);
}
export function playCountdownTick() {
  if (!ready || muted || paused || context.state !== 'running') return;
  const source = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  source.frequency.value = 660;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(.06, now + .01);
  gain.gain.exponentialRampToValueAtTime(.001, now + .12);
  source.connect(gain).connect(master);
  activeSounds.add(source);
  source.onended = () => { activeSounds.delete(source); source.disconnect(); gain.disconnect(); };
  source.start(now);
  source.stop(now + .13);
}
export function playSound(kind, shipScale = 2.4, allowPaused = false) {
  // The fatal impact may play while gameplay is paused for the crash drift.
  if (!ready || muted || (paused && !allowPaused) || context.state !== 'running') return;
  const bank = banks[kind];
  let variant = Math.floor(Math.random() * bank.buffers.length);
  if (variant === bank.last && bank.buffers.length > 1) variant = (variant + 1 + Math.floor(Math.random() * (bank.buffers.length - 1))) % bank.buffers.length;
  bank.last = variant;
  const source = context.createBufferSource();
  source.buffer = bank.buffers[variant];
  source.playbackRate.value = kind === 'explosion' ? (1.18 - shipScale * .1) * (.96 + Math.random() * .08)
    : kind === 'shot' ? .9 : kind === 'go' || kind === 'checkpoint' || kind === 'checkpointMiss' || kind === 'reward' || kind === 'empty' || kind === 'lock' || kind === 'shieldGlance' || kind === 'shieldHard' ? 1 : .96 + Math.random() * .08;
  const gain = context.createGain();
  gain.gain.value = bank.volume * (bank.variantGains ? bank.variantGains[variant] : 1);
  source.connect(gain).connect(master);
  activeSounds.add(source);
  source.onended = () => { activeSounds.delete(source); source.disconnect(); gain.disconnect(); };
  source.start();
}

import './style.css';
import { createBeach } from './scene.js';
import { IslandAudio } from './audio.js';
import { clamp, cycleHour, groundHeight, movePosition } from './world.js';

const $ = id => document.getElementById(id);
const audio = new IslandAudio();
let beach;
function error(message) { $('error-message').textContent = message; $('error').hidden = false; }
try { beach = createBeach($('scene')); }
catch (cause) { console.error(cause); error('3D描画を開始できませんでした。WebGL 2に対応したiPhoneのSafariなどで、もう一度お試しください。'); }
if (beach) start(beach);

function start({ camera, renderer, resize, render, setHour }) {
  let entered = false, settingsOpen = false, yaw = 0, pitch = -0.10;
  let position = { x: 0, z: 13 }, hour = 14, autoTime = false, quality = 'auto';
  let clock = 0, lastFrame = 0, animation = 0, frameSum = 0, frameCount = 0, ratio;
  let soundBusy = false, noticeTimer, previousFocus;
  const input = { x: 0, y: 0 }, keys = new Set();
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function notify(message) { clearTimeout(noticeTimer); $('notice').textContent = message; $('notice').hidden = false; noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4000); }
  function updateSoundButton() { $('sound-toggle').setAttribute('aria-pressed', String(audio.playing)); $('sound-toggle').setAttribute('aria-label', audio.playing ? '音を停止' : '音を再生'); }
  async function playSound() {
    if (soundBusy) return;
    soundBusy = true;
    try { await audio.play(); } catch (cause) { notify(cause.message); } finally { soundBusy = false; updateSoundButton(); }
  }
  $('sound-toggle').addEventListener('click', async () => {
    if (soundBusy) return;
    if (audio.playing) { soundBusy = true; try { await audio.pause(); } finally { soundBusy = false; updateSoundButton(); } }
    else await playSound();
  });
  $('enter').addEventListener('click', () => {
    if (entered) return;
    entered = true;
    $('welcome').classList.add('departing');
    setTimeout(() => { $('welcome').hidden = true; $('reset-view').focus({ preventScroll: true }); }, motionReduced ? 0 : 600);
    $('controls').hidden = false; $('scene-caption').hidden = false;
    if (!audio.playing) void playSound();
  });
  function resetView() { position = { x: 0, z: 13 }; yaw = 0; pitch = -0.10; resetInput(); }
  $('reset-view').addEventListener('click', resetView);
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); resetView(); });
  function resetInput() { input.x = input.y = 0; keys.clear(); lookPointer = null; joystickPointer = null; $('stick').style.transform = ''; }
  function openSettings(open) {
    settingsOpen = open; resetInput();
    $('settings').hidden = !open; $('settings-scrim').hidden = !open;
    $('settings-toggle').setAttribute('aria-expanded', String(open));
    for (const id of ['welcome', 'controls', 'scene-caption']) $(id).inert = open;
    document.querySelector('.topbar').inert = open;
    if (open) { previousFocus = document.activeElement; $('settings-close').focus(); }
    else (previousFocus || $('settings-toggle')).focus();
  }
  $('settings-toggle').addEventListener('click', () => openSettings(!settingsOpen));
  $('settings-close').addEventListener('click', () => openSettings(false));
  $('settings-scrim').addEventListener('click', () => openSettings(false));
  document.addEventListener('keydown', event => {
    if (settingsOpen) {
      if (event.key === 'Escape') openSettings(false);
      if (event.key === 'Tab') {
        const focusable = [...$('settings').querySelectorAll('button,input,select')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (entered && ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', resetInput);

  let lookPointer = null, lookX = 0, lookY = 0, joystickPointer = null;
  $('scene').addEventListener('pointerdown', event => {
    if (!entered || settingsOpen || lookPointer !== null) return;
    lookPointer = event.pointerId; lookX = event.clientX; lookY = event.clientY; $('scene').setPointerCapture(event.pointerId);
  });
  $('scene').addEventListener('pointermove', event => {
    if (event.pointerId !== lookPointer) return;
    yaw -= (event.clientX - lookX) * 0.004; pitch = clamp(pitch - (event.clientY - lookY) * 0.0035, -1.05, 1.0);
    lookX = event.clientX; lookY = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('scene').addEventListener(type, event => { if (event.pointerId === lookPointer) lookPointer = null; });
  function updateJoystick(event) {
    const rect = $('joystick').getBoundingClientRect(), dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy), radius = rect.width * 0.31, limit = distance > radius ? radius / distance : 1;
    input.x = dx * limit / radius; input.y = -dy * limit / radius;
    $('stick').style.transform = `translate(${dx * limit}px, ${dy * limit}px)`;
  }
  $('joystick').addEventListener('pointerdown', event => { if (joystickPointer !== null) return; joystickPointer = event.pointerId; $('joystick').setPointerCapture(event.pointerId); updateJoystick(event); });
  $('joystick').addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) $('joystick').addEventListener(type, event => { if (event.pointerId === joystickPointer) { joystickPointer = null; input.x = input.y = 0; $('stick').style.transform = ''; } });

  function showHour() {
    const hours = Math.floor(hour), minutes = Math.floor((hour % 1) * 60);
    $('clock').textContent = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
    $('hour').value = String(hour);
    $('time-label').textContent = hour < 6 || hour >= 20 ? '月あかりの浜辺' : hour < 10 ? '朝の海風' : hour < 17 ? '午後のひととき' : '夕暮れの波音';
    document.querySelectorAll('[data-hour]').forEach(button => { const selected = Math.abs(Number(button.dataset.hour) - hour) < 0.12; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    setHour(hour);
  }
  function persist() { try { localStorage.setItem('nami-settings-v1', JSON.stringify({ hour, autoTime, quality, music: audio.track, musicVolume: audio.musicVolume, natureVolume: audio.natureVolume })); } catch { /* Storage can be unavailable in private browsing. */ } }
  $('hour').addEventListener('input', event => { hour = Number(event.target.value); showHour(); });
  $('hour').addEventListener('change', persist);
  document.querySelectorAll('[data-hour]').forEach(button => button.addEventListener('click', () => { hour = Number(button.dataset.hour); showHour(); persist(); }));
  $('auto-time').addEventListener('change', event => { autoTime = event.target.checked; persist(); });
  $('music').addEventListener('change', event => { audio.setTrack(event.target.value); persist(); });
  for (const id of ['music-volume','nature-volume']) {
    $(id).addEventListener('input', () => audio.setVolumes(Number($('music-volume').value), Number($('nature-volume').value)));
    $(id).addEventListener('change', persist);
  }
  function updateQuality() {
    ratio = quality === 'low' ? Math.min(window.devicePixelRatio || 1, 0.85) : Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
    renderer.shadowMap.enabled = quality !== 'low'; resize(ratio);
    document.querySelectorAll('[data-quality]').forEach(button => { const selected = button.dataset.quality === quality; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    frameCount = frameSum = 0;
  }
  document.querySelectorAll('[data-quality]').forEach(button => button.addEventListener('click', () => { quality = button.dataset.quality; updateQuality(); persist(); }));
  window.addEventListener('resize', () => resize(ratio));
  try {
    const saved = JSON.parse(localStorage.getItem('nami-settings-v1') || 'null');
    if (saved) {
      if (Number.isFinite(saved.hour)) hour = clamp(saved.hour, 0, 23.99);
      autoTime = saved.autoTime === true;
      if (['auto','high','low'].includes(saved.quality)) quality = saved.quality;
      audio.setTrack(saved.music);
      audio.setVolumes(Number.isFinite(saved.musicVolume) ? saved.musicVolume : 0.42, Number.isFinite(saved.natureVolume) ? saved.natureVolume : 0.7);
    }
  } catch { /* Invalid old settings fall back to defaults. */ }
  $('auto-time').checked = autoTime; $('music').value = audio.track;
  $('music-volume').value = String(audio.musicVolume); $('nature-volume').value = String(audio.natureVolume);
  showHour(); updateQuality();
  function frame(timestamp) {
    const elapsed = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.1) : 0;
    lastFrame = timestamp; clock += elapsed;
    if (entered && !settingsOpen) {
      const keyboardX = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const keyboardY = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      position = movePosition(position, { x: clamp(input.x + keyboardX,-1,1), y: clamp(input.y + keyboardY,-1,1) }, yaw, elapsed);
    }
    camera.position.set(position.x, groundHeight(position.x, position.z) + 1.68, position.z);
    camera.rotation.set(pitch, yaw, 0);
    if (autoTime) { hour = cycleHour(hour, elapsed); showHour(); }
    render(clock);
    if (quality === 'auto' && elapsed > 0 && frameCount++ > 40) {
      frameSum += elapsed;
      if (frameCount >= 160) {
        if (frameSum / (frameCount - 41) > 1 / 38 && ratio > 0.76) { ratio = Math.max(0.75, ratio - 0.25); resize(ratio); }
        frameSum = frameCount = 0;
      }
    }
    animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', async () => {
    resetInput(); lastFrame = 0;
    if (document.hidden) { cancelAnimationFrame(animation); persist(); await audio.suspendForBackground(); }
    else { animation = requestAnimationFrame(frame); try { await audio.resumeFromBackground(); if (audio.context && audio.playing && audio.context.state !== 'running') { audio.playing = false; notify('音のボタンをタップすると再開します。'); } } catch { audio.playing = false; notify('音のボタンをタップすると再開します。'); } updateSoundButton(); }
  });
  $('scene').addEventListener('webglcontextlost', event => { event.preventDefault(); cancelAnimationFrame(animation); void audio.pause(); error('描画が中断されました。「もう一度開く」でビーチに戻れます。省電力設定もお試しください。'); });
}

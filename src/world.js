export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const shore = x => 1.8 + 0.6 * Math.sin(x * 0.09) + 0.35 * Math.cos(x * 0.23);
export function groundHeight(x, z) {
  const inland = z - shore(x);
  return inland < 0 ? Math.max(-3.2, inland * 0.17) : 0.035 + inland * 0.055 + 0.1 * Math.sin(x * 0.11) * Math.min(inland / 10, 1);
}
export function movePosition(position, input, yaw, dt) {
  const length = Math.hypot(input.x, input.y);
  const norm = Math.max(1, length);
  const speed = 3.0 * Math.min(dt, 0.05);
  const x = clamp(position.x + (input.x * Math.cos(yaw) - input.y * Math.sin(yaw)) / norm * speed, -30, 30);
  const z = position.z + (-input.x * Math.sin(yaw) - input.y * Math.cos(yaw)) / norm * speed;
  return { x, z: clamp(z, shore(x) + 1.7, 30) };
}
export function cycleHour(hour, dt) { return ((hour + dt / 30) % 24 + 24) % 24; }
export function daylight(hour) {
  return clamp(Math.sin((hour - 6) / 24 * Math.PI * 2) * 1.6 + 0.15, 0, 1);
}
export function seededRandom(seed = 12) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

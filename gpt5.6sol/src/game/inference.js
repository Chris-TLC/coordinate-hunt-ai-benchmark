const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function clueStrength(clue, now) {
  if (!clue || clue.ttl <= 0 || now < clue.createdAt) return 0;
  const age = now - clue.createdAt;
  if (age >= clue.ttl) return 0;
  const lifetime = 1 - (age / clue.ttl);
  return clamp01((clue.confidence ?? 1) * Math.pow(lifetime, 0.72));
}

export function estimateTarget(clues, now) {
  const active = (clues ?? [])
    .map((clue) => ({ clue, weight: clueStrength(clue, now) }))
    .filter(({ weight, clue }) => weight > 0 && Number.isFinite(clue.x) && Number.isFinite(clue.z));

  if (active.length === 0) return { x: 0, z: 0, confidence: 0, age: Infinity };
  const total = active.reduce((sum, item) => sum + item.weight, 0);
  const newest = Math.max(...active.map(({ clue }) => clue.createdAt));
  return {
    x: active.reduce((sum, { clue, weight }) => sum + (clue.x * weight), 0) / total,
    z: active.reduce((sum, { clue, weight }) => sum + (clue.z * weight), 0) / total,
    confidence: clamp01(total / Math.max(1, active.length * 0.72)),
    age: now - newest,
  };
}

export function noisyClue(position, precision, random = Math.random) {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * precision;
  return {
    x: position.x + (Math.cos(angle) * radius),
    z: position.z + (Math.sin(angle) * radius),
  };
}

/**
 * PARCHE PARTY — Unit Tests
 * Run: npm test  (node --test tests/unit.test.js)
 *
 * Tests pure/isolated logic from game.js.
 * Uses ESM imports (package.json tiene "type":"module").
 * No dependencies de browser (Phaser/window). Cero impacto en tamaño del juego.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Replicas de funciones puras de game.js ──────────────────────────────
// Deben mantenerse sincronizadas con las implementaciones en game.js.

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

const W = 800, HALF = W / 2;
const CH_LANES = 3;
const CH_LANE_W = 72;

function laneX(arena, lane) {
  const areaW = HALF - 8;
  const areaX = arena === 0 ? 4 : HALF + 4;
  const totalLanesW = CH_LANES * CH_LANE_W;
  const offsetX = (areaW - totalLanesW) / 2;
  return areaX + offsetX + lane * CH_LANE_W + CH_LANE_W / 2;
}

function tejoVelocity(angleDeg, charge, MIN_SPEED, MAX_SPEED) {
  const speed = MIN_SPEED + charge * (MAX_SPEED - MIN_SPEED);
  const rad = (angleDeg * Math.PI) / 180;
  return { vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed, speed };
}

function clampAngle(angle, min, max) {
  return Math.max(min, Math.min(max, angle));
}

function computeFinalScores(localScores, bonus) {
  const winner =
    localScores.p1 > localScores.p2 ? 'p1' :
    localScores.p2 > localScores.p1 ? 'p2' : 'draw';
  return {
    winner,
    p1bonus: winner === 'p1' ? bonus : winner === 'draw' ? Math.floor(bonus * 0.4) : 0,
    p2bonus: winner === 'p2' ? bonus : winner === 'draw' ? Math.floor(bonus * 0.4) : 0,
  };
}

function mkState(mgPool, totalRounds) {
  return {
    phase: 'loading',
    round: 0,
    totalRounds: totalRounds || 4,
    queue: shuffle(mgPool.slice()),
    scores: { p1: 0, p2: 0 },
    currentMg: null,
    highScores: [],
  };
}

function isValidHighScoreEntry(e) {
  return (
    e != null &&
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    typeof e.date === 'string'
  );
}

function cafeSpillRate(angle, spillAngle, maxAngle) {
  if (Math.abs(angle) <= spillAngle) return 0;
  return (Math.abs(angle) - spillAngle) / (maxAngle - spillAngle);
}

function arepaArenaBounds(arena, halfW) {
  return arena === 0
    ? { xMin: 20, xMax: halfW - 20 }
    : { xMin: halfW + 20, xMax: halfW * 2 - 20 };
}

// ─── TESTS ────────────────────────────────────────────────────────────────

describe('shuffle()', () => {
  test('devuelve un arreglo del mismo tamaño', () => {
    const original = ['arepa', 'chiva', 'tejo', 'cafe'];
    const result = shuffle(original);
    assert.equal(result.length, original.length);
  });

  test('contiene los mismos elementos que el original', () => {
    const original = ['arepa', 'chiva', 'tejo', 'cafe'];
    const result = shuffle(original);
    const sorted = (a) => [...a].sort();
    assert.deepEqual(sorted(result), sorted(original));
  });

  test('no muta el arreglo original', () => {
    const original = ['arepa', 'chiva', 'tejo', 'cafe'];
    const copy = [...original];
    shuffle(original);
    assert.deepEqual(original, copy);
  });

  test('arreglo vacío devuelve vacío', () => {
    assert.deepEqual(shuffle([]), []);
  });

  test('arreglo de un elemento devuelve ese mismo elemento', () => {
    assert.deepEqual(shuffle(['solo']), ['solo']);
  });
});

describe('pad2()', () => {
  test('un dígito se rellena con 0', () => {
    assert.equal(pad2(5), '05');
    assert.equal(pad2(0), '00');
    assert.equal(pad2(9), '09');
  });

  test('dos dígitos no cambian', () => {
    assert.equal(pad2(10), '10');
    assert.equal(pad2(99), '99');
  });

  test('floats se truncan al entero inferior', () => {
    assert.equal(pad2(3.9), '03');
    assert.equal(pad2(9.1), '09');
  });

  test('valores negativos se tratan como 0', () => {
    assert.equal(pad2(-5), '00');
  });
});

describe('laneX() — posicionamiento de carriles Chiva Loca', () => {
  test('arena 0 carril 1 (centro) está en la mitad izquierda', () => {
    const x = laneX(0, 1);
    assert.ok(x > 0 && x < HALF, `esperado 0 < ${x} < ${HALF}`);
  });

  test('arena 1 carril 1 (centro) está en la mitad derecha', () => {
    const x = laneX(1, 1);
    assert.ok(x > HALF && x < W, `esperado ${HALF} < ${x} < ${W}`);
  });

  test('carril 0 está a la izquierda del carril 1 en ambas arenas', () => {
    assert.ok(laneX(0, 0) < laneX(0, 1));
    assert.ok(laneX(1, 0) < laneX(1, 1));
  });

  test('carril 2 está a la derecha del carril 1 en ambas arenas', () => {
    assert.ok(laneX(0, 2) > laneX(0, 1));
    assert.ok(laneX(1, 2) > laneX(1, 1));
  });

  test('los carriles tienen separación suficiente (>= LANE_W * 0.8)', () => {
    for (let ar = 0; ar < 2; ar++) {
      const x0 = laneX(ar, 0), x1 = laneX(ar, 1), x2 = laneX(ar, 2);
      assert.ok(x1 - x0 >= CH_LANE_W * 0.8, `carriles 0-1 muy juntos en arena ${ar}`);
      assert.ok(x2 - x1 >= CH_LANE_W * 0.8, `carriles 1-2 muy juntos en arena ${ar}`);
    }
  });
});

describe('tejoVelocity() — física de lanzamiento Tejo Turbo', () => {
  const MIN = 280, MAX = 700;

  test('carga 0 → velocidad mínima', () => {
    const { speed } = tejoVelocity(-90, 0, MIN, MAX);
    assert.ok(Math.abs(speed - MIN) < 1, `speed=${speed} esperado≈${MIN}`);
  });

  test('carga 1 → velocidad máxima', () => {
    const { speed } = tejoVelocity(-90, 1, MIN, MAX);
    assert.ok(Math.abs(speed - MAX) < 1, `speed=${speed} esperado≈${MAX}`);
  });

  test('ángulo -90° lanza hacia arriba (vy < 0)', () => {
    const { vy } = tejoVelocity(-90, 0.5, MIN, MAX);
    assert.ok(vy < 0, `vy=${vy} debería ser negativo (hacia arriba)`);
  });

  test('ángulo -90° no tiene componente horizontal (|vx| < 0.01)', () => {
    const { vx } = tejoVelocity(-90, 0.5, MIN, MAX);
    assert.ok(Math.abs(vx) < 0.01, `vx=${vx} debería ser ≈0`);
  });

  test('ángulo -45° tiene |vx| ≈ |vy|', () => {
    const { vx, vy } = tejoVelocity(-45, 0.5, MIN, MAX);
    assert.ok(Math.abs(Math.abs(vx) - Math.abs(vy)) < 1, `vx=${vx} vy=${vy}`);
  });

  test('velocidad siempre positiva para cualquier ángulo válido', () => {
    for (const angle of [-160, -90, -45, -20]) {
      const { speed } = tejoVelocity(angle, 0.5, MIN, MAX);
      assert.ok(speed > 0, `speed negativa para ángulo ${angle}`);
    }
  });

  test('velocidad aumenta monotónicamente con la carga', () => {
    const s0 = tejoVelocity(-90, 0, MIN, MAX).speed;
    const s1 = tejoVelocity(-90, 0.5, MIN, MAX).speed;
    const s2 = tejoVelocity(-90, 1, MIN, MAX).speed;
    assert.ok(s0 < s1 && s1 < s2, `velocidades no monótonas: ${s0} ${s1} ${s2}`);
  });
});

describe('clampAngle() — límites de puntería Tejo', () => {
  test('ángulo dentro del rango no cambia', () => {
    assert.equal(clampAngle(-90, -160, -20), -90);
  });

  test('ángulo menor al mínimo se clampea', () => {
    assert.equal(clampAngle(-200, -160, -20), -160);
  });

  test('ángulo mayor al máximo se clampea', () => {
    assert.equal(clampAngle(0, -160, -20), -20);
  });

  test('ángulo igual al límite inferior se acepta', () => {
    assert.equal(clampAngle(-160, -160, -20), -160);
  });

  test('ángulo igual al límite superior se acepta', () => {
    assert.equal(clampAngle(-20, -160, -20), -20);
  });
});

describe('computeFinalScores() — bonus por ronda', () => {
  const BONUS = 500;

  test('P1 gana → bonus completo a P1, cero a P2', () => {
    const r = computeFinalScores({ p1: 80, p2: 40 }, BONUS);
    assert.equal(r.winner, 'p1');
    assert.equal(r.p1bonus, BONUS);
    assert.equal(r.p2bonus, 0);
  });

  test('P2 gana → bonus completo a P2, cero a P1', () => {
    const r = computeFinalScores({ p1: 10, p2: 90 }, BONUS);
    assert.equal(r.winner, 'p2');
    assert.equal(r.p2bonus, BONUS);
    assert.equal(r.p1bonus, 0);
  });

  test('empate → ambos reciben bonus parcial igual', () => {
    const r = computeFinalScores({ p1: 50, p2: 50 }, BONUS);
    assert.equal(r.winner, 'draw');
    assert.ok(r.p1bonus > 0 && r.p1bonus < BONUS);
    assert.equal(r.p1bonus, r.p2bonus);
  });

  test('empate en 0 → bonus parcial simétrico', () => {
    const r = computeFinalScores({ p1: 0, p2: 0 }, BONUS);
    assert.equal(r.winner, 'draw');
    assert.equal(r.p1bonus, r.p2bonus);
  });

  test('winner es exactamente "p1", "p2" o "draw"', () => {
    const valid = new Set(['p1', 'p2', 'draw']);
    for (const [s1, s2] of [[10, 5], [5, 10], [5, 5]]) {
      const r = computeFinalScores({ p1: s1, p2: s2 }, BONUS);
      assert.ok(valid.has(r.winner), `winner="${r.winner}" no es válido`);
    }
  });
});

describe('mkState() — estado inicial del juego', () => {
  const MG_POOL = ['arepa', 'chiva', 'tejo', 'cafe'];

  test('fase inicial es "loading"', () => {
    assert.equal(mkState(MG_POOL, 4).phase, 'loading');
  });

  test('round inicial es 0', () => {
    assert.equal(mkState(MG_POOL, 4).round, 0);
  });

  test('scores empiezan en 0', () => {
    assert.deepEqual(mkState(MG_POOL, 4).scores, { p1: 0, p2: 0 });
  });

  test('queue tiene todos los microjuegos (en cualquier orden)', () => {
    const s = mkState(MG_POOL, 4);
    assert.equal(s.queue.length, MG_POOL.length);
    assert.deepEqual([...s.queue].sort(), [...MG_POOL].sort());
  });

  test('totalRounds configurables', () => {
    assert.equal(mkState(MG_POOL, 3).totalRounds, 3);
    assert.equal(mkState(MG_POOL, 4).totalRounds, 4);
  });

  test('highScores empieza como arreglo vacío', () => {
    assert.deepEqual(mkState(MG_POOL, 4).highScores, []);
  });
});

describe('isValidHighScoreEntry() — validación de entradas del ranking', () => {
  test('entrada válida pasa', () => {
    assert.ok(isValidHighScoreEntry({ name: 'ABC', score: 1500, date: '2026-08-19' }));
  });

  test('sin nombre falla', () => {
    assert.ok(!isValidHighScoreEntry({ score: 100, date: '2026-08-19' }));
  });

  test('score de tipo string falla', () => {
    assert.ok(!isValidHighScoreEntry({ name: 'XYZ', score: '100', date: '2026-08-19' }));
  });

  test('null falla', () => {
    assert.ok(!isValidHighScoreEntry(null));
  });

  test('objeto vacío falla', () => {
    assert.ok(!isValidHighScoreEntry({}));
  });

  test('sin date falla', () => {
    assert.ok(!isValidHighScoreEntry({ name: 'ABC', score: 100 }));
  });
});

describe('cafeSpillRate() — tasa de derrame Café en Equilibrio', () => {
  const SPILL = 26, MAX = 32;

  test('dentro del rango seguro → tasa 0', () => {
    assert.equal(cafeSpillRate(20, SPILL, MAX), 0);
    assert.equal(cafeSpillRate(0, SPILL, MAX), 0);
    assert.equal(cafeSpillRate(-25, SPILL, MAX), 0);
  });

  test('ángulo máximo → tasa ≈ 1', () => {
    assert.ok(Math.abs(cafeSpillRate(MAX, SPILL, MAX) - 1) < 0.001);
  });

  test('ángulo negativo máximo → tasa ≈ 1 (simétrico)', () => {
    assert.ok(Math.abs(cafeSpillRate(-MAX, SPILL, MAX) - 1) < 0.001);
  });

  test('tasa aumenta progresivamente con el ángulo', () => {
    const r1 = cafeSpillRate(27, SPILL, MAX);
    const r2 = cafeSpillRate(30, SPILL, MAX);
    assert.ok(r2 > r1, `r2(${r2}) debe ser > r1(${r1})`);
  });

  test('tasa siempre >= 0 para cualquier ángulo', () => {
    for (const a of [0, 10, 26, 30, 32, -32]) {
      assert.ok(cafeSpillRate(a, SPILL, MAX) >= 0, `tasa negativa para ángulo ${a}`);
    }
  });
});

describe('arepaArenaBounds() — límites de spawneo por arena', () => {
  const HW = 400;

  test('arena 0 → bounds dentro de la mitad izquierda', () => {
    const b = arepaArenaBounds(0, HW);
    assert.ok(b.xMin >= 0 && b.xMax <= HW);
  });

  test('arena 1 → bounds dentro de la mitad derecha', () => {
    const b = arepaArenaBounds(1, HW);
    assert.ok(b.xMin >= HW && b.xMax <= HW * 2);
  });

  test('el rango es positivo en ambas arenas', () => {
    assert.ok(arepaArenaBounds(0, HW).xMax > arepaArenaBounds(0, HW).xMin);
    assert.ok(arepaArenaBounds(1, HW).xMax > arepaArenaBounds(1, HW).xMin);
  });

  test('las arenas no se superponen (xMax arena0 < xMin arena1)', () => {
    const b0 = arepaArenaBounds(0, HW);
    const b1 = arepaArenaBounds(1, HW);
    assert.ok(b0.xMax < b1.xMin, `arena 0 (xMax=${b0.xMax}) y arena 1 (xMin=${b1.xMin}) se superponen`);
  });
});

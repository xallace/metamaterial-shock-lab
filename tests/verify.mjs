// Checks physics.js against closed-form results: node tests/verify.mjs
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
(0, eval)(readFileSync(new URL('../physics.js', import.meta.url), 'utf8'));
const MAT = window.GRANULAR_MATERIALS;

let failed = 0;
function check(name, ok, detail) {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${detail}`);
    if (!ok) failed++;
}

function run(engine, seconds, onStep) {
    const steps = Math.round(seconds / engine.maxSubDt);
    engine.skipFreeApproach();
    for (let i = 0; i < steps; i++) {
        engine.verletSubStep(engine.maxSubDt);
        engine.simTime += engine.maxSubDt;
        if (onStep) onStep(engine);
    }
    engine.calculateMetrics(false);
}

// 1. Two-sphere Hertz impact (striker on one free steel sphere): peak force and contact time
{
    const e = new GranularPhysicsEngine();
    e.initChain('newton', { strikerSpeed: 5 });
    e.beads = [e.beads[0]];
    const s = e.striker, b = e.beads[0];
    const A = e.getContactStiffness(s, b);
    const mEff = s.m * b.m / (s.m + b.m);
    const deltaMax = Math.pow(5 * mEff * 25 / (4 * A), 0.4);
    const fMax = A * Math.pow(deltaMax, 1.5);
    const tContact = 2.9432 * deltaMax / 5;      // Hertz: t_c = 2.9432 * δ_max / v
    let tOn = null, tOff = null;
    run(e, 3e-4, en => {
        const f = en.striker.contactForceRight;
        if (f > 0 && tOn === null) tOn = en.simTime;
        if (f === 0 && tOn !== null && tOff === null) tOff = en.simTime;
    });
    const fErr = Math.abs(e.metrics.peakInputForce / fMax - 1);
    const tErr = Math.abs((tOff - tOn) / tContact - 1);
    check('Hertz-Stoß Spitzenkraft', fErr < 0.002, `${e.metrics.peakInputForce.toFixed(0)} N, Formel ${fMax.toFixed(0)} N (${(fErr * 100).toFixed(3)} %)`);
    check('Hertz-Stoß Kontaktzeit', tErr < 0.01, `${((tOff - tOn) * 1e6).toFixed(2)} µs, Formel ${(tContact * 1e6).toFixed(2)} µs`);
    check('Hertz-Stoß Geschwindigkeitstausch', Math.abs(b.v - 5) < 0.01 && Math.abs(s.v) < 0.01, `Kugel ${b.v.toFixed(4)} m/s, Stoßkugel ${s.v.toFixed(4)} m/s`);
}

// 2. Solitary wave speed in a long steel chain vs. Nesterenko's long-wave solution:
//    V_s = (2/√5) c ξ_m^(1/4),  c² = 2E / (π ρ (1-ν²)),  ξ_m = δ_m / a   (a = sphere diameter)
{
    const e = new GranularPhysicsEngine();
    e.initChain('newton', { strikerSpeed: 5 });
    const r = e.beads[0].r;
    e.beads = [];
    for (let i = 0; i < 40; i++) e.beads.push(e.makeBody(r, 'steel', r + 2 * r * i, 0));
    e.striker.x = e.beads[0].x - 2 * r - 1e-6;
    const peakT = {}, peakF = {};
    let width = 0, v20 = 0;
    run(e, 1.2e-3, en => {
        for (const i of [15, 30]) {
            const f = en.beads[i].contactForceLeft;
            if (f > (peakF[i] || 0)) { peakF[i] = f; peakT[i] = en.simTime; }
        }
        // Wave width at the moment bead 20 is fastest: 5 beads above 0.1 %, the next ones below 1e-5
        if (en.beads[20].v > v20) {
            v20 = en.beads[20].v;
            width = en.beads.filter(b => b.v > 1e-3 * v20).length;
        }
    });
    const vs = (15 * 2 * r) / (peakT[30] - peakT[15]);
    const st = MAT.steel;
    const fm = peakF[30];
    const deltaM = Math.pow(fm / e.getContactStiffness(e.beads[29], e.beads[30]), 2 / 3);
    const c = Math.sqrt(2 * st.E / (Math.PI * st.rho * (1 - st.nu ** 2)));
    const vsTheory = 2 / Math.sqrt(5) * c * Math.pow(deltaM / (2 * r), 0.25);
    const err = Math.abs(vs / vsTheory - 1);
    check('Solitonengeschwindigkeit', err < 0.03, `${vs.toFixed(0)} m/s bei F_m = ${fm.toFixed(0)} N, Nesterenko ${vsTheory.toFixed(0)} m/s (${(err * 100).toFixed(1)} %)`);
    check('Soliton ohne Abklingen', Math.abs(peakF[30] / peakF[15] - 1) < 0.02, `F_m Kugel 16: ${peakF[15].toFixed(0)} N, Kugel 31: ${peakF[30].toFixed(0)} N`);
    check('Wellenbreite 5 Kugeln', width === 5, `${width} Kugeln mit v > 0,1 % der Spitze`);
}

// 3. Energy conservation and results of every preset
console.log('\nPreset (5 m/s, 3 ms)     F_Ein     F_Wand  F_Wand/F_Ein  Energiefehler');
let worstEnergy = 0;
for (const [preset, reverse] of [['monodisperse'], ['tapered'], ['diode'], ['diode', true], ['diatomic'], ['defect'], ['newton']]) {
    const e = new GranularPhysicsEngine();
    e.initChain(preset, { strikerSpeed: 5, reverse });
    const e0 = e.metrics.initialEnergy;
    run(e, 3e-3);
    const dE = Math.abs(e.metrics.totalEnergy / e0 - 1);
    worstEnergy = Math.max(worstEnergy, dE);
    const name = preset + (reverse ? ' (umgekehrt)' : '');
    console.log(`${name.padEnd(22)} ${(e.metrics.peakInputForce / 1000).toFixed(2).padStart(6)} kN ${(e.metrics.peakTransmittedForce / 1000).toFixed(2).padStart(6)} kN ${e.metrics.forceRatio === null ? '     -' : e.metrics.forceRatio.toFixed(2).padStart(6)}   ${(dE * 100).toFixed(4)} %`);
    if (preset === 'newton') {
        const last = e.beads[e.beads.length - 1];
        const p = [e.striker, ...e.beads].reduce((sum, b) => sum + b.m * b.v, 0);
        check('Newtons Wiege Impulserhaltung', Math.abs(p / (e.striker.m * 5) - 1) < 1e-6, `p = ${p.toFixed(5)} kg·m/s`);
        console.log(`     letzte Kugel ${last.v.toFixed(2)} m/s, Energieanteil ${(0.5 * last.m * last.v ** 2 / e0 * 100).toFixed(1)} %`);
    }
}
check('Energieerhaltung aller Presets', worstEnergy < 1e-3, `größter Fehler ${(worstEnergy * 100).toFixed(4)} %`);

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);

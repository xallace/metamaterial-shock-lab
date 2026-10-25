/**
 * Granular Metamaterial Shock Lab — Physics Engine
 * 1D chain of elastic spheres with Hertzian contacts, SI units (m, kg, s, N, J)
 *
 * Equations of Motion:
 * m_i * x''_i = F_{i-1,i} - F_{i,i+1},   F = A * δ^(3/2) for δ > 0, otherwise 0
 * Contact Stiffness: A = (4/3) * E* * sqrt(R*)
 *   1/E* = (1 - ν1²)/E1 + (1 - ν2²)/E2,   1/R* = 1/R1 + 1/R2 (sphere on flat wall: R* = R)
 * Integrator: Velocity Verlet with a fixed sub-step of at most 0.1 µs
 * No damping: the total energy stays constant and serves as a check of the integrator.
 *
 * Copyright (c) 2026 Walter (@xallace)
 * MIT License
 */

// Material data (typical handbook values)
const MATERIALS = {
    steel:    { label: 'Stahl',         E: 210e9,  nu: 0.30, rho: 7850 },
    tungsten: { label: 'Wolframkarbid', E: 600e9,  nu: 0.22, rho: 15000 },
    aluminum: { label: 'Aluminium',     E: 70e9,   nu: 0.33, rho: 2700 },
    ptfe:     { label: 'PTFE',          E: 1.46e9, nu: 0.46, rho: 2200 }
};

const BASE_RADIUS = 0.01;      // Reference sphere Ø 20 mm
const STRIKER_GAP = 0.001;     // Striker starts 1 mm in front of the chain
const CONTACT_EPS = 1e-12;     // Overlaps below 1 pm are rounding noise of the touching layout

class GranularPhysicsEngine {
    constructor() {
        this.maxSubDt = 1e-7;            // Largest integration step [s]
        this.simTime = 0;                // Elapsed simulation time [s]
        this.timeScale = 1e-4;           // Simulated seconds per real second

        this.beads = [];
        this.striker = null;
        this.wall = {
            enabled: true,
            x: 0,
            force: 0,
            peakForce: 0,
            material: 'steel'
        };

        // Live Diagnostic Metrics
        this.metrics = {
            totalKineticEnergy: 0,
            totalPotentialEnergy: 0,
            totalEnergy: 0,
            initialEnergy: 0,
            peakInputForce: 0,
            peakTransmittedForce: 0,
            forceRatio: null,            // F_wall,max / F_in,max (null until the wall is hit)
            referenceForce: 1,           // Predicted peak force of the first impact [N]
            anyContact: false,
            approachSkipped: 0           // Skipped free-flight time of the striker [s]
        };

        // History Buffer for Real-Time Oscilloscope Plot (one peak value per frame)
        this.historyLength = 320;
        this.history = {
            times: [],
            wallForces: [],
            beadForces: [],              // Contact force striker / bead 1 (input impulse)
            centerForces: []             // Contact force at the center bead
        };

        this.frameStrikerPeak = 0;
        this.frameWallPeak = 0;
        this.frameCenterPeak = 0;

        this.currentPreset = 'monodisperse';
        this.params = { strikerSpeed: 5.0, reverse: false };
    }

    /**
     * Initializes preset chain architectures
     */
    initChain(preset = 'monodisperse', params = {}) {
        this.currentPreset = preset;
        this.params = {
            strikerSpeed: params.strikerSpeed !== undefined ? params.strikerSpeed : 5.0,
            reverse: !!params.reverse
        };
        this.beads = [];
        this.simTime = 0;
        this.metrics.peakInputForce = 0;
        this.metrics.peakTransmittedForce = 0;
        this.metrics.forceRatio = null;
        this.metrics.approachSkipped = 0;
        this.metrics.anyContact = false;
        this.wall.force = 0;
        this.wall.peakForce = 0;
        this.history.times = [];
        this.history.wallForces = [];
        this.history.beadForces = [];
        this.history.centerForces = [];

        let radii = [];        // multiples of BASE_RADIUS
        let materials = [];

        switch (preset) {
            case 'tapered':
                // Geometrically decreasing radii, q = 0.91
                for (let i = 0; i < 12; i++) {
                    radii.push(Math.pow(0.91, i));
                    materials.push('steel');
                }
                break;

            case 'diatomic':
                // Alternating heavy and light beads
                for (let i = 0; i < 14; i++) {
                    radii.push(i % 2 === 0 ? 1.05 : 0.72);
                    materials.push(i % 2 === 0 ? 'tungsten' : 'aluminum');
                }
                break;

            case 'diode':
                // Stepped chain: 4 large -> 4 medium -> 4 small (reversed: small -> large)
                for (let i = 0; i < 12; i++) {
                    radii.push(i < 4 ? 1.15 : i < 8 ? 0.85 : 0.60);
                    materials.push('steel');
                }
                if (this.params.reverse) radii.reverse();
                break;

            case 'defect':
                // Steel chain with a soft PTFE sphere at the center
                for (let i = 0; i < 13; i++) {
                    radii.push(i === 6 ? 0.8 : 1.0);
                    materials.push(i === 6 ? 'ptfe' : 'steel');
                }
                break;

            case 'newton':
                // Free end on the right, no wall
                for (let i = 0; i < 8; i++) {
                    radii.push(1.0);
                    materials.push('steel');
                }
                break;

            case 'monodisperse':
            default:
                for (let i = 0; i < 12; i++) {
                    radii.push(1.0);
                    materials.push('steel');
                }
                break;
        }

        this.wall.enabled = preset !== 'newton';

        // Layout: touching spheres without precompression ("sonic vacuum")
        let currentX = 0;
        for (let i = 0; i < radii.length; i++) {
            const r = radii[i] * BASE_RADIUS;
            currentX = i === 0 ? r : currentX + this.beads[i - 1].r + r;
            this.beads.push(this.makeBody(r, materials[i], currentX, 0));
        }

        // Striker: steel sphere Ø 20 mm
        const first = this.beads[0];
        const strikerX = first.x - first.r - BASE_RADIUS - STRIKER_GAP;
        this.striker = this.makeBody(BASE_RADIUS, 'steel', strikerX, this.params.strikerSpeed);
        this.striker.initialSpeed = this.params.strikerSpeed;

        // Rigid wall touching the last bead
        const last = this.beads[this.beads.length - 1];
        this.wall.x = last.x + last.r;

        // Predicted peak force of the first impact (two-body Hertz impact), used to scale glow and plots
        const A = this.getContactStiffness(this.striker, first);
        const mEff = this.striker.m * first.m / (this.striker.m + first.m);
        const v = Math.max(0.1, this.params.strikerSpeed);
        const deltaMax = Math.pow(5 * mEff * v * v / (4 * A), 0.4);
        this.metrics.referenceForce = A * Math.pow(deltaMax, 1.5);

        this.metrics.initialEnergy = 0.5 * this.striker.m * this.params.strikerSpeed ** 2;
        this.calculateMetrics(false);
    }

    makeBody(r, material, x, v) {
        const mat = MATERIALS[material];
        return {
            r: r,
            m: (4 / 3) * Math.PI * r ** 3 * mat.rho,
            x: x,
            v: v,
            a: 0,
            material: material,
            contactForceLeft: 0,
            contactForceRight: 0,
            framePeak: 0,
            stressGlow: 0,
            initialX: x
        };
    }

    /**
     * Resets the current preset (keeps the diode direction)
     */
    reset(strikerSpeed = null) {
        const speed = strikerSpeed !== null ? strikerSpeed : this.params.strikerSpeed;
        this.initChain(this.currentPreset, { strikerSpeed: speed, reverse: this.params.reverse });
    }

    /**
     * Restarts the current preset with the striker released at x [m] with speed v [m/s] (drag interaction)
     */
    launchFrom(x, v) {
        this.reset(v);
        this.striker.x = x;
        this.striker.initialX = x;
    }

    /**
     * Hertz contact stiffness A [N/m^1.5] between two spheres, or a sphere and the flat wall (b = null)
     */
    getContactStiffness(a, b) {
        const ma = MATERIALS[a.material];
        const mb = MATERIALS[b ? b.material : this.wall.material];
        const eStar = 1 / ((1 - ma.nu ** 2) / ma.E + (1 - mb.nu ** 2) / mb.E);
        const rStar = b ? (a.r * b.r) / (a.r + b.r) : a.r;
        return (4 / 3) * eStar * Math.sqrt(rStar);
    }

    /**
     * Advances the simulation by one animation frame
     * @param {number} dt Frame time delta in real seconds
     */
    update(dt) {
        if (dt <= 0) return;

        this.skipFreeApproach();

        const effectiveDt = dt * this.timeScale;
        const subSteps = Math.min(20000, Math.max(1, Math.ceil(effectiveDt / this.maxSubDt)));
        const subDt = effectiveDt / subSteps;

        this.frameStrikerPeak = 0;
        this.frameWallPeak = 0;
        this.frameCenterPeak = 0;
        for (const b of this.beads) b.framePeak = 0;

        for (let step = 0; step < subSteps; step++) {
            this.verletSubStep(subDt);
            this.simTime += subDt;
        }

        this.calculateMetrics(true);

        // Stress glow follows the largest contact force of the frame
        const fRef = this.metrics.referenceForce;
        this.striker.stressGlow = Math.max(Math.min(1, this.frameStrikerPeak / fRef), this.striker.stressGlow * 0.88);
        for (const b of this.beads) {
            b.stressGlow = Math.max(Math.min(1, b.framePeak / fRef), b.stressGlow * 0.90);
        }
    }

    /**
     * While the chain is at rest and the striker is still in free flight, jump to 1 mm before contact.
     * At the default time scale the approach from a pulled-back striker would take minutes.
     */
    skipFreeApproach() {
        const s = this.striker;
        const first = this.beads[0];
        if (this.metrics.anyContact || s.v <= 0) return;
        if (this.beads.some(b => b.v !== 0)) return;
        const gap = (first.x - first.r) - (s.x + s.r);
        if (gap <= STRIKER_GAP) return;
        const skip = (gap - STRIKER_GAP) / s.v;
        s.x += s.v * skip;
        this.simTime += skip;
        this.metrics.approachSkipped += skip;
    }

    /**
     * Single Velocity Verlet sub-step
     */
    verletSubStep(dt) {
        const all = [this.striker, ...this.beads];
        const n = all.length;

        // Positions from current velocity and acceleration
        for (let i = 0; i < n; i++) {
            const obj = all[i];
            obj.x += obj.v * dt + 0.5 * obj.a * dt * dt;
            obj.contactForceLeft = 0;
            obj.contactForceRight = 0;
        }
        this.wall.force = 0;
        let anyContact = false;

        // Hertz contact forces (compression only)
        const forces = new Float64Array(n);
        for (let i = 0; i < n - 1; i++) {
            const b1 = all[i];
            const b2 = all[i + 1];
            const overlap = (b1.r + b2.r) - (b2.x - b1.x);
            if (overlap > 0) {
                const f = this.getContactStiffness(b1, b2) * Math.pow(overlap, 1.5);
                forces[i] -= f;
                forces[i + 1] += f;
                b1.contactForceRight = f;
                b2.contactForceLeft = f;
                if (overlap > CONTACT_EPS) anyContact = true;
            }
        }

        // Rigid wall on the right
        if (this.wall.enabled) {
            const last = all[n - 1];
            const overlap = (last.x + last.r) - this.wall.x;
            if (overlap > 0) {
                const f = this.getContactStiffness(last, null) * Math.pow(overlap, 1.5);
                forces[n - 1] -= f;
                last.contactForceRight = f;
                this.wall.force = f;
                if (overlap > CONTACT_EPS) anyContact = true;
            }
        }
        this.metrics.anyContact = anyContact;

        // Velocities from the mean of old and new acceleration
        for (let i = 0; i < n; i++) {
            const obj = all[i];
            const newA = forces[i] / obj.m;
            obj.v += 0.5 * (obj.a + newA) * dt;
            obj.a = newA;
        }

        // Peaks for metrics, oscilloscope and glow
        const fIn = this.striker.contactForceRight;
        const fWall = this.wall.force;
        const center = this.beads[Math.floor(this.beads.length / 2)];
        if (fIn > this.metrics.peakInputForce) this.metrics.peakInputForce = fIn;
        if (fWall > this.wall.peakForce) {
            this.wall.peakForce = fWall;
            this.metrics.peakTransmittedForce = fWall;
        }
        if (fIn > this.frameStrikerPeak) this.frameStrikerPeak = fIn;
        if (fWall > this.frameWallPeak) this.frameWallPeak = fWall;
        if (center.contactForceLeft > this.frameCenterPeak) this.frameCenterPeak = center.contactForceLeft;
        for (const b of this.beads) {
            const f = Math.max(b.contactForceLeft, b.contactForceRight);
            if (f > b.framePeak) b.framePeak = f;
        }
    }

    /**
     * Energy and diagnostic calculations
     * @param {boolean} record Append the frame peaks to the oscilloscope history
     */
    calculateMetrics(record) {
        const all = [this.striker, ...this.beads];
        let kin = 0;
        let pot = 0;

        for (let i = 0; i < all.length; i++) {
            kin += 0.5 * all[i].m * all[i].v ** 2;
        }
        for (let i = 0; i < all.length - 1; i++) {
            const overlap = (all[i].r + all[i + 1].r) - (all[i + 1].x - all[i].x);
            if (overlap > 0) {
                // Integral of A * δ^(3/2) dδ = (2/5) * A * δ^(5/2)
                pot += 0.4 * this.getContactStiffness(all[i], all[i + 1]) * Math.pow(overlap, 2.5);
            }
        }
        if (this.wall.enabled) {
            const last = all[all.length - 1];
            const overlap = (last.x + last.r) - this.wall.x;
            if (overlap > 0) pot += 0.4 * this.getContactStiffness(last, null) * Math.pow(overlap, 2.5);
        }

        this.metrics.totalKineticEnergy = kin;
        this.metrics.totalPotentialEnergy = pot;
        this.metrics.totalEnergy = kin + pot;
        this.metrics.forceRatio = this.wall.enabled && this.metrics.peakTransmittedForce > 0 && this.metrics.peakInputForce > 0
            ? this.metrics.peakTransmittedForce / this.metrics.peakInputForce
            : null;

        if (!record) return;
        this.history.times.push(this.simTime);
        this.history.wallForces.push(this.frameWallPeak);
        this.history.beadForces.push(this.frameStrikerPeak);
        this.history.centerForces.push(this.frameCenterPeak);

        if (this.history.times.length > this.historyLength) {
            this.history.times.shift();
            this.history.wallForces.shift();
            this.history.beadForces.shift();
            this.history.centerForces.shift();
        }
    }
}

// Export for browser
window.GranularPhysicsEngine = GranularPhysicsEngine;
window.GRANULAR_MATERIALS = MATERIALS;

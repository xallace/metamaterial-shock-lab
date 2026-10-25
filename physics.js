/**
 * Granular Metamaterial Shock Lab — Physics Engine
 * Non-linear 1D Discrete Hertzian Contact Dynamics
 * 
 * Equations of Motion:
 * m_i * u''_i = A_{i-1,i} * [u_{i-1} - u_i]_+^(3/2) - A_{i,i+1} * [u_i - u_{i+1}]_+^(3/2)
 * Contact Stiffness: A = (4/3) * E* * sqrt(R*)
 * Integrator: Sub-stepped Symplectic Velocity Verlet
 * 
 * Copyright (c) 2026 Walter (@xallace)
 * MIT License
 */

class GranularPhysicsEngine {
    constructor() {
        // Physical & Numerical Tuning Parameters
        this.baseStiffness = 18000;      // Contact stiffness scaling (N/m^(3/2) normalized)
        this.contactDamping = 12.0;      // Viscoelastic damping coefficient gamma
        this.airDrag = 0.04;             // Ambient air resistance
        this.wallStiffness = 32000;      // Rigid sensor wall stiffness
        this.density = 7.85;             // Density factor (steel-like, g/cm^3 relative)

        this.subSteps = 45;              // Sub-steps per render frame for stiff stability
        this.simTime = 0;                // Elapsed simulation time
        this.timeScale = 1.0;            // Speed multiplier (slow-mo)

        this.beads = [];                 // Granule objects
        this.wall = {
            enabled: true,
            x: 18.0,
            force: 0,
            peakForce: 0,
            thickness: 0.6,
            height: 4.5,
            width: 4.5
        };

        // Live Diagnostic Metrics
        this.metrics = {
            totalKineticEnergy: 0,
            totalPotentialEnergy: 0,
            totalEnergy: 0,
            initialEnergy: 0,
            peakInputForce: 0,
            peakTransmittedForce: 0,
            mitigationRatio: 0,          // eta = 1 - (F_wall / F_in)
            solitonSpeed: 0
        };

        // History Buffer for Real-Time Oscilloscope Plot
        this.historyLength = 320;
        this.history = {
            times: [],
            wallForces: [],
            beadForces: [],              // Contact force at bead 1 (input impulse)
            centerForces: []             // Contact force at center bead
        };

        this.currentPreset = 'monodisperse';
    }

    /**
     * Initializes preset chain architectures
     */
    initChain(preset = 'monodisperse', params = {}) {
        this.currentPreset = preset;
        this.beads = [];
        this.simTime = 0;
        this.metrics.peakInputForce = 0;
        this.metrics.peakTransmittedForce = 0;
        this.metrics.mitigationRatio = 0;
        this.wall.force = 0;
        this.wall.peakForce = 0;
        this.history.times = [];
        this.history.wallForces = [];
        this.history.beadForces = [];
        this.history.centerForces = [];

        const strikerSpeed = params.strikerSpeed !== undefined ? params.strikerSpeed : 5.0;
        const strikerGap = params.strikerGap !== undefined ? params.strikerGap : 3.0;

        let numBeads = 12;
        let radii = [];
        let materials = [];

        switch (preset) {
            case 'tapered':
                // Monotonically decreasing bead radii (geometric tapering factor q = 0.91)
                numBeads = 12;
                const q = 0.91;
                for (let i = 0; i < numBeads; i++) {
                    radii.push(1.0 * Math.pow(q, i));
                    materials.push('steel');
                }
                break;

            case 'diatomic':
                // Alternating heavy and light beads (creates phononic bandgaps)
                numBeads = 14;
                for (let i = 0; i < numBeads; i++) {
                    radii.push(i % 2 === 0 ? 1.05 : 0.72);
                    materials.push(i % 2 === 0 ? 'tungsten' : 'aluminum');
                }
                break;

            case 'diode':
                // Acoustic Diode: 4 large beads -> 4 medium -> 4 small
                numBeads = 12;
                for (let i = 0; i < numBeads; i++) {
                    if (i < 4) radii.push(1.15);
                    else if (i < 8) radii.push(0.85);
                    else radii.push(0.60);
                    materials.push('steel');
                }
                break;

            case 'defect':
                // Chain with a soft/light elastomer defect at the center
                numBeads = 13;
                for (let i = 0; i < numBeads; i++) {
                    if (i === 6) {
                        radii.push(0.8);
                        materials.push('polymer');
                    } else {
                        radii.push(1.0);
                        materials.push('steel');
                    }
                }
                break;

            case 'newton':
                // Classic Newton's Cradle (Free boundary on the right)
                numBeads = 8;
                for (let i = 0; i < numBeads; i++) {
                    radii.push(1.0);
                    materials.push('steel');
                }
                this.wall.enabled = false;
                break;

            case 'monodisperse':
            default:
                // Classical identical steel beads (Pure Nesterenko Soliton)
                numBeads = 12;
                for (let i = 0; i < numBeads; i++) {
                    radii.push(1.0);
                    materials.push('steel');
                }
                break;
        }

        if (preset !== 'newton') {
            this.wall.enabled = true;
        }

        // Layout beads along X-axis starting at x = 0
        let currentX = 0;
        for (let i = 0; i < numBeads; i++) {
            const r = radii[i];
            const mat = materials[i];
            
            // Mass proportional to volume: m = (4/3) * pi * r^3 * density
            let densityMultiplier = 1.0;
            if (mat === 'tungsten') densityMultiplier = 2.45;
            if (mat === 'aluminum') densityMultiplier = 0.35;
            if (mat === 'polymer')  densityMultiplier = 0.15;

            const mass = (4 / 3) * Math.PI * Math.pow(r, 3) * this.density * densityMultiplier;

            if (i > 0) {
                currentX += radii[i - 1] + r;
            } else {
                currentX = r;
            }

            this.beads.push({
                id: i,
                r: r,
                m: mass,
                x: currentX,
                v: 0,
                a: 0,
                material: mat,
                contactForceLeft: 0,
                contactForceRight: 0,
                stressGlow: 0,
                initialX: currentX
            });
        }

        // Configure Striker (Impactor) Bead at index 0 or as a dedicated impactor
        const firstBead = this.beads[0];
        const strikerR = preset === 'diode' && params.reverse ? 0.6 : 1.0;
        const strikerMass = (4 / 3) * Math.PI * Math.pow(strikerR, 3) * this.density;

        // Position of the striker is to the left of bead 0
        const strikerPos = firstBead.x - firstBead.r - strikerR - strikerGap;

        this.striker = {
            r: strikerR,
            m: strikerMass,
            x: strikerPos,
            v: strikerSpeed,
            a: 0,
            material: 'hardened_steel',
            contactForce: 0,
            stressGlow: 0,
            initialX: strikerPos,
            initialSpeed: strikerSpeed
        };

        // Position the rigid end sensor wall immediately touching or slightly offset from last bead
        const lastBead = this.beads[this.beads.length - 1];
        this.wall.x = lastBead.x + lastBead.r + 0.05;

        // Compute initial total energy (striker kinetic energy)
        this.metrics.initialEnergy = 0.5 * this.striker.m * Math.pow(strikerSpeed, 2);
    }

    /**
     * Resets the current preset with new striker speed
     */
    reset(strikerSpeed = null) {
        const speed = strikerSpeed !== null ? strikerSpeed : this.striker.initialSpeed;
        this.initChain(this.currentPreset, { strikerSpeed: speed });
    }

    /**
     * Computes Hertzian effective stiffness between two spheres
     */
    getContactStiffness(r1, r2, mat1, mat2) {
        const rEff = (r1 * r2) / (r1 + r2);
        let matFactor = 1.0;
        if (mat1 === 'polymer' || mat2 === 'polymer') matFactor = 0.15;
        if (mat1 === 'tungsten' || mat2 === 'tungsten') matFactor = 1.8;
        if (mat1 === 'aluminum' || mat2 === 'aluminum') matFactor = 0.5;

        return this.baseStiffness * matFactor * Math.sqrt(rEff);
    }

    /**
     * Physics update step using Velocity Verlet integration
     * @param {number} dt Frame time delta in seconds
     */
    update(dt) {
        if (dt <= 0) return;
        // Apply Slow-Mo / Time Scale factor
        const effectiveDt = dt * this.timeScale;
        const subDt = effectiveDt / this.subSteps;

        for (let step = 0; step < this.subSteps; step++) {
            this.verletSubStep(subDt);
            this.simTime += subDt;
        }

        // Post-step metrics & diagnostics
        this.calculateMetrics();

        // Decay visual stress glow values smoothly for high-framerate rendering
        this.striker.stressGlow = Math.max(0, this.striker.stressGlow * 0.88);
        for (let i = 0; i < this.beads.length; i++) {
            const b = this.beads[i];
            const maxF = Math.max(b.contactForceLeft, b.contactForceRight);
            // Normalized glow between 0 and 1
            const targetGlow = Math.min(1.0, maxF / 250);
            b.stressGlow = Math.max(targetGlow, b.stressGlow * 0.90);
        }
    }

    /**
     * Single symplectic Verlet sub-step
     */
    verletSubStep(dt) {
        const allObjects = [this.striker, ...this.beads];
        const numObjects = allObjects.length;

        // Step 1: Position update from current velocity and acceleration
        for (let i = 0; i < numObjects; i++) {
            const obj = allObjects[i];
            obj.x += obj.v * dt + 0.5 * obj.a * dt * dt;
            // Reset contact forces for this sub-step
            if (obj === this.striker) {
                obj.contactForce = 0;
            } else {
                obj.contactForceLeft = 0;
                obj.contactForceRight = 0;
            }
        }
        this.wall.force = 0;

        // Step 2: Compute non-linear Hertzian contact forces
        const forces = new Float64Array(numObjects);

        for (let i = 0; i < numObjects - 1; i++) {
            const b1 = allObjects[i];
            const b2 = allObjects[i + 1];

            const dist = b2.x - b1.x;
            const overlap = (b1.r + b2.r) - dist;

            if (overlap > 0) {
                const kEff = this.getContactStiffness(b1.r, b2.r, b1.material, b2.material);
                const vRel = b1.v - b2.v; // Positive if approaching

                // Hertzian non-linear power 3/2 + viscoelastic damping
                const fElastic = kEff * Math.pow(overlap, 1.5);
                const fDamping = this.contactDamping * Math.sqrt(Math.max(0, overlap)) * vRel;
                const fTotal = Math.max(0, fElastic + fDamping); // Compression only

                forces[i] -= fTotal;
                forces[i + 1] += fTotal;

                if (i === 0) {
                    this.striker.contactForce = fTotal;
                    this.beads[0].contactForceLeft = fTotal;
                    if (fTotal > this.metrics.peakInputForce) {
                        this.metrics.peakInputForce = fTotal;
                    }
                } else {
                    const beadIdx1 = i - 1;
                    const beadIdx2 = i;
                    this.beads[beadIdx1].contactForceRight = fTotal;
                    this.beads[beadIdx2].contactForceLeft = fTotal;
                }
            }
        }

        // Wall boundary contact on the rightmost bead
        if (this.wall.enabled) {
            const lastBead = this.beads[this.beads.length - 1];
            const wallOverlap = (lastBead.x + lastBead.r) - this.wall.x;

            if (wallOverlap > 0) {
                const kWall = this.wallStiffness * Math.sqrt(lastBead.r);
                const fElasticWall = kWall * Math.pow(wallOverlap, 1.5);
                const fDampingWall = this.contactDamping * 1.5 * Math.sqrt(wallOverlap) * Math.max(0, lastBead.v);
                const fWall = Math.max(0, fElasticWall + fDampingWall);

                forces[numObjects - 1] -= fWall;
                lastBead.contactForceRight = fWall;
                this.wall.force = fWall;

                if (fWall > this.wall.peakForce) {
                    this.wall.peakForce = fWall;
                    this.metrics.peakTransmittedForce = fWall;
                }
            }
        }

        // Step 3 & 4: Velocity update with new acceleration
        for (let i = 0; i < numObjects; i++) {
            const obj = allObjects[i];
            // Linear air damping
            const dragForce = -this.airDrag * obj.v;
            const newA = (forces[i] + dragForce) / obj.m;

            obj.v += 0.5 * (obj.a + newA) * dt;
            obj.a = newA;
        }
    }

    /**
     * Energy and diagnostic calculations
     */
    calculateMetrics() {
        let kin = 0.5 * this.striker.m * Math.pow(this.striker.v, 2);
        let pot = 0;

        const allObjects = [this.striker, ...this.beads];
        for (let i = 0; i < allObjects.length - 1; i++) {
            const b1 = allObjects[i];
            const b2 = allObjects[i + 1];
            const overlap = (b1.r + b2.r) - (b2.x - b1.x);
            if (overlap > 0) {
                const kEff = this.getContactStiffness(b1.r, b2.r, b1.material, b2.material);
                // Integral of k * delta^(3/2) d_delta = (2/5) * k * delta^(5/2)
                pot += (2 / 5) * kEff * Math.pow(overlap, 2.5);
            }
        }

        // Wall potential
        if (this.wall.enabled) {
            const lastBead = this.beads[this.beads.length - 1];
            const wallOverlap = (lastBead.x + lastBead.r) - this.wall.x;
            if (wallOverlap > 0) {
                const kWall = this.wallStiffness * Math.sqrt(lastBead.r);
                pot += (2 / 5) * kWall * Math.pow(wallOverlap, 2.5);
            }
        }

        for (let i = 0; i < this.beads.length; i++) {
            kin += 0.5 * this.beads[i].m * Math.pow(this.beads[i].v, 2);
        }

        this.metrics.totalKineticEnergy = kin;
        this.metrics.totalPotentialEnergy = pot;
        this.metrics.totalEnergy = kin + pot;

        // Shock Mitigation Ratio: eta = 1 - (F_wall_max / F_input_max)
        if (this.metrics.peakInputForce > 0) {
            const ratio = 1 - (this.metrics.peakTransmittedForce / this.metrics.peakInputForce);
            this.metrics.mitigationRatio = Math.max(0, Math.min(1.0, ratio));
        }

        // Append to history buffer for plotting
        this.history.times.push(this.simTime);
        this.history.wallForces.push(this.wall.force);
        this.history.beadForces.push(this.striker.contactForce);

        const centerIdx = Math.floor(this.beads.length / 2);
        const centerF = this.beads[centerIdx] ? this.beads[centerIdx].contactForceLeft : 0;
        this.history.centerForces.push(centerF);

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

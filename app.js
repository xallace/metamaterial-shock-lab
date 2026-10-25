/**
 * Granular Metamaterial Shock Lab — Application Controller
 * UI bindings, real-time 2D oscilloscope plotter, preset manager,
 * and high-framerate simulation loop.
 * 
 * Copyright (c) 2026 Walter (@xallace)
 * MIT License
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Core Engines
    const viewportContainer = document.getElementById('viewport-3d');
    const physics = new GranularPhysicsEngine();

    // Initial chain setup (the scene reads striker and beads in its constructor)
    physics.initChain('monodisperse', { strikerSpeed: 5.0 });
    const scene3d = new GranularScene3D(viewportContainer, physics);

    // 2. Application UI State
    const state = {
        isRunning: true,
        strikerSpeed: 5.0,
        timeScale: 1e-4,            // 100 µs simulated per real second: the wave needs a few seconds through the chain
        currentPreset: 'monodisperse',
        diodeReversed: false
    };

    physics.timeScale = state.timeScale;

    function formatForce(f) {
        return f >= 1000 ? `${(f / 1000).toFixed(2)} kN` : `${f.toFixed(0)} N`;
    }

    function formatTime(t) {
        return t >= 1e-3 ? `${(t * 1e3).toFixed(2)} ms` : `${(t * 1e6).toFixed(0)} µs`;
    }

    // 3. Oscilloscope Canvas Setup
    const oscCanvas = document.getElementById('oscilloscope-canvas');
    const oscCtx = oscCanvas.getContext('2d');

    function resizeOscilloscope() {
        const rect = oscCanvas.getBoundingClientRect();
        oscCanvas.width = rect.width * (window.devicePixelRatio || 1);
        oscCanvas.height = rect.height * (window.devicePixelRatio || 1);
    }
    resizeOscilloscope();
    window.addEventListener('resize', resizeOscilloscope);

    /**
     * Renders high-precision oscilloscope force curves
     */
    function renderOscilloscope() {
        const w = oscCanvas.width;
        const h = oscCanvas.height;
        const ctx = oscCtx;

        ctx.clearRect(0, 0, w, h);

        // Background grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const gridStepY = h / 4;
        for (let y = gridStepY; y < h; y += gridStepY) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        const hist = physics.history;
        const count = hist.wallForces.length;
        if (count < 2) return;

        // Auto-scale peak for display
        let maxVal = Math.max(
            physics.metrics.referenceForce * 0.5,
            physics.metrics.peakInputForce * 1.15,
            physics.metrics.peakTransmittedForce * 1.15
        );

        const padX = 10;
        const padY = 12;
        const plotW = w - padX * 2;
        const plotH = h - padY * 2;

        function drawCurve(series, strokeColor, lineWidth = 2) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth * (window.devicePixelRatio || 1);
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
                const x = padX + (i / (physics.historyLength - 1)) * plotW;
                const val = Math.min(maxVal, Math.max(0, series[i] || 0));
                const y = h - padY - (val / maxVal) * plotH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Draw curves:
        // Cyan = Input Impact (Bead 1)
        drawCurve(hist.beadForces, '#38bdf8', 2.0);
        // Amber = Center Pulse
        drawCurve(hist.centerForces, '#f59e0b', 1.5);
        // Crimson = Transmitted Wall Force
        if (physics.wall.enabled) drawCurve(hist.wallForces, '#ef4444', 2.5);

        // Force scale and simulated time span of the window
        const dpr = window.devicePixelRatio || 1;
        ctx.fillStyle = '#64748b';
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillText(formatForce(maxVal), padX + 4, padY + 12 * dpr);
        ctx.fillText('0 N', padX + 4, h - padY - 4);
        const span = hist.times[count - 1] - hist.times[0];
        const label = `Fenster ${formatTime(span)} Simulationszeit`;
        ctx.textAlign = 'right';
        ctx.fillText(label, w - padX - 4, padY + 12 * dpr);
        ctx.textAlign = 'left';
    }

    // 4. Update Metric Badges
    const elPeakIn = document.getElementById('val-peak-in');
    const elPeakOut = document.getElementById('val-peak-out');
    const elRatio = document.getElementById('val-ratio');
    const elKinEnergy = document.getElementById('val-kin-energy');
    const elPotEnergy = document.getElementById('val-pot-energy');
    const elSimTime = document.getElementById('val-sim-time');
    const elSolitonStatus = document.getElementById('val-soliton-status');

    function updateMetricsUI() {
        const m = physics.metrics;
        if (elPeakIn) elPeakIn.textContent = formatForce(m.peakInputForce);
        if (elPeakOut) elPeakOut.textContent = physics.wall.enabled ? formatForce(m.peakTransmittedForce) : '–';

        if (elRatio) {
            if (m.forceRatio === null) {
                elRatio.textContent = '–';
                elRatio.style.color = '#94a3b8';
            } else {
                elRatio.textContent = m.forceRatio.toFixed(2);
                elRatio.style.color = m.forceRatio < 0.6 ? '#34d399' : m.forceRatio < 1 ? '#fbbf24' : '#f87171';
            }
        }

        if (elKinEnergy) elKinEnergy.textContent = `${(m.totalKineticEnergy * 1000).toFixed(1)} mJ`;
        if (elPotEnergy) elPotEnergy.textContent = `${(m.totalPotentialEnergy * 1000).toFixed(1)} mJ`;
        if (elSimTime) elSimTime.textContent = formatTime(physics.simTime);

        if (elSolitonStatus) {
            const fMin = 0.01 * m.referenceForce;
            const chainMoving = physics.beads.some(b => b.v !== 0);
            if (physics.wall.force > fMin) {
                elSolitonStatus.textContent = 'WAND-AUFPRALL';
                elSolitonStatus.style.color = '#ef4444';
            } else if (physics.striker.contactForceRight > fMin) {
                elSolitonStatus.textContent = 'IMPULS-EINLEITUNG';
                elSolitonStatus.style.color = '#38bdf8';
            } else if (m.anyContact) {
                elSolitonStatus.textContent = 'WELLENLAUF';
                elSolitonStatus.style.color = '#f59e0b';
            } else if (!chainMoving && physics.striker.v > 0) {
                elSolitonStatus.textContent = 'ANFLUG';
                elSolitonStatus.style.color = '#94a3b8';
            } else if (m.totalKineticEnergy > 0) {
                elSolitonStatus.textContent = 'FREIE BEWEGUNG';
                elSolitonStatus.style.color = '#94a3b8';
            } else {
                elSolitonStatus.textContent = 'RUHEZUSTAND';
                elSolitonStatus.style.color = '#94a3b8';
            }
        }
    }

    // 5. Preset Switcher Controls
    const presetButtons = document.querySelectorAll('.preset-btn');
    const presetDesc = document.getElementById('preset-description');

    // Ratios F_wall/F_in from tests/verify.mjs; they do not depend on the striker speed (Hertz scaling)
    const presetDescriptions = {
        monodisperse: '<strong>Homogene Kette:</strong> 12 Stahlkugeln Ø 20 mm, berührend, ohne Vorspannung ("Sonic Vacuum"). Aus dem Stoß entsteht eine Solitärwelle von rund 5 Kugeldurchmessern Breite, die ohne Abklingen durch die Kette läuft (bei 5 m/s mit rund 940 m/s). An der starren Wand wird sie reflektiert, dort wirkt das 1,64-Fache der Eingangskraft.',
        tapered: '<strong>Verjüngte Kette:</strong> Jede Kugel ist 9 % kleiner als die vorige (q = 0,91, Ø 20 → 7 mm). An der Wand kommen 0,92 × F_Ein an. Bei gleichem Stoß sind das 44 % weniger als bei der homogenen Kette (6,4 statt 11,4 kN bei 5 m/s).',
        diatomic: '<strong>Diatomische Kette:</strong> Abwechselnd Wolframkarbid Ø 21 mm und Aluminium Ø 14,4 mm, Massenverhältnis rund 17 : 1. Die Welle braucht länger bis zur Wand (480 statt 383 µs bei 5 m/s), dort kommen 0,51 × F_Ein an.',
        diode: '<strong>Gestufte Kette:</strong> 4 × Ø 23 mm, 4 × Ø 17 mm, 4 × Ø 12 mm. Von groß nach klein kommen 0,93 × F_Ein an der Wand an (7,4 kN bei 5 m/s). Umgekehrt (klein nach groß) trifft die Stoßkugel zuerst eine kleine Kugel: die Eingangskraft halbiert sich, an der Wand kommt aber mehr an (2,43 × F_Ein, 8,7 kN).',
        newton: '<strong>Newtons Wiege:</strong> 8 Stahlkugeln, rechts ohne Wand. Die letzte Kugel fliegt mit 98,6 % der Stoßgeschwindigkeit weg und nimmt 97 % der Energie mit. Der Rest bleibt als Bewegung in der Kette, weil Hertz-Kontakte nachgiebig sind. Das Lehrbuchbild mit genau einer Kugel gilt nur für starre Kugeln.',
        defect: '<strong>Weiche Störstelle:</strong> Stahlkette mit einer PTFE-Kugel Ø 16 mm in der Mitte, PTFE ist rund 140-mal weicher als Stahl. An der Wand kommen 0,47 × F_Ein an, ohne Dämpfung im Modell.'
    };

    function applyPreset(presetName) {
        state.currentPreset = presetName;
        presetButtons.forEach(btn => {
            if (btn.dataset.preset === presetName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (presetDesc && presetDescriptions[presetName]) {
            presetDesc.innerHTML = presetDescriptions[presetName];
        }

        // Show/hide Diode Reverse button
        const diodeToggle = document.getElementById('diode-reverse-container');
        if (diodeToggle) {
            diodeToggle.style.display = presetName === 'diode' ? 'flex' : 'none';
        }

        physics.initChain(presetName, {
            strikerSpeed: state.strikerSpeed,
            reverse: presetName === 'diode' && state.diodeReversed
        });
        scene3d.syncWithPhysics();
        scene3d.setView(scene3d.view);
    }

    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            applyPreset(btn.dataset.preset);
        });
    });

    // 6. Impact Trigger & Speed Slider
    const fireBtn = document.getElementById('btn-fire');
    const resetBtn = document.getElementById('btn-reset');
    const speedSlider = document.getElementById('striker-speed');
    const speedDisplay = document.getElementById('striker-speed-val');

    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            state.strikerSpeed = parseFloat(e.target.value);
            if (speedDisplay) speedDisplay.textContent = `${state.strikerSpeed.toFixed(1)} m/s`;
        });
    }

    // Drag release in the 3D view sets the speed like the slider
    scene3d.onStrikerLaunch = (speed) => {
        state.strikerSpeed = speed;
        if (speedSlider) speedSlider.value = speed;
        if (speedDisplay) speedDisplay.textContent = `${speed.toFixed(1)} m/s`;
        state.isRunning = true;
        setPlayPauseLabel();
    };

    if (fireBtn) {
        fireBtn.addEventListener('click', () => {
            physics.reset(state.strikerSpeed);
            scene3d.syncWithPhysics();
            state.isRunning = true;
            setPlayPauseLabel();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            physics.reset(state.strikerSpeed);
            scene3d.syncWithPhysics();
            state.isRunning = false;
            setPlayPauseLabel();
        });
    }

    // 7. Time Scale / Slow-Mo Controls
    const slowMoButtons = document.querySelectorAll('.slowmo-btn');
    slowMoButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            slowMoButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const scale = parseFloat(btn.dataset.scale);
            state.timeScale = scale;
            physics.timeScale = scale;
        });
    });

    // Play / Pause / Step
    const playPauseBtn = document.getElementById('btn-play-pause');
    const stepBtn = document.getElementById('btn-step');

    function setPlayPauseLabel() {
        if (!playPauseBtn) return;
        playPauseBtn.innerHTML = state.isRunning ?
            '<i class="ph-bold ph-pause"></i><span>Pause</span>' :
            '<i class="ph-bold ph-play"></i><span>Start</span>';
    }

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            state.isRunning = !state.isRunning;
            setPlayPauseLabel();
        });
    }

    if (stepBtn) {
        stepBtn.addEventListener('click', () => {
            state.isRunning = false;
            setPlayPauseLabel();
            physics.update(0.016);
            scene3d.render();
            renderOscilloscope();
            updateMetricsUI();
        });
    }

    // Camera view presets, framed on the current chain
    for (const view of ['iso', 'front', 'top']) {
        const btn = document.getElementById(`cam-${view}`);
        if (btn) btn.addEventListener('click', () => scene3d.setView(view));
    }

    // Diode reverse toggle
    const diodeReverseCheckbox = document.getElementById('diode-reverse-toggle');
    if (diodeReverseCheckbox) {
        diodeReverseCheckbox.addEventListener('change', (e) => {
            state.diodeReversed = e.target.checked;
            applyPreset('diode');
        });
    }

    // 8. Main Animation Frame Loop
    let lastTime = performance.now();
    let frameCounter = 0;

    function animate(currentTime) {
        requestAnimationFrame(animate);

        const dt = Math.min(0.033, (currentTime - lastTime) / 1000);
        lastTime = currentTime;

        if (state.isRunning && !scene3d.isDraggingStriker) {
            physics.update(dt);
        }

        scene3d.render();

        frameCounter++;
        if (frameCounter % 2 === 0) {
            renderOscilloscope();
            updateMetricsUI();
        }
    }

    requestAnimationFrame(animate);
});

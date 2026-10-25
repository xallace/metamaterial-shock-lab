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
    const scene3d = new GranularScene3D(viewportContainer, physics);

    // Initial chain setup
    physics.initChain('monodisperse', { strikerSpeed: 5.0 });
    scene3d.syncWithPhysics();

    // 2. Application UI State
    const state = {
        isRunning: true,
        strikerSpeed: 5.0,
        timeScale: 0.20,            // Default 0.20x slow-motion for crisp soliton observation
        currentPreset: 'monodisperse',
        diodeReversed: false,
        cameraPreset: 'iso'
    };

    physics.timeScale = state.timeScale;

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
            150,
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
        drawCurve(hist.wallForces, '#ef4444', 2.5);

        // Peak force scale indicator
        ctx.fillStyle = '#64748b';
        ctx.font = `${10 * (window.devicePixelRatio || 1)}px 'JetBrains Mono', monospace`;
        ctx.fillText(`${Math.round(maxVal)} N`, padX + 4, padY + 12);
        ctx.fillText('0 N', padX + 4, h - padY - 4);
    }

    // 4. Update Metric Badges
    const elPeakIn = document.getElementById('val-peak-in');
    const elPeakOut = document.getElementById('val-peak-out');
    const elMitigation = document.getElementById('val-mitigation');
    const elKinEnergy = document.getElementById('val-kin-energy');
    const elPotEnergy = document.getElementById('val-pot-energy');
    const elSolitonStatus = document.getElementById('val-soliton-status');

    function updateMetricsUI() {
        if (elPeakIn) elPeakIn.textContent = `${physics.metrics.peakInputForce.toFixed(1)} N`;
        if (elPeakOut) elPeakOut.textContent = `${physics.metrics.peakTransmittedForce.toFixed(1)} N`;

        if (elMitigation) {
            const pct = (physics.metrics.mitigationRatio * 100).toFixed(1);
            elMitigation.textContent = `${pct} %`;
            if (physics.metrics.mitigationRatio > 0.6) {
                elMitigation.className = 'metric-value text-emerald-400 font-mono';
            } else if (physics.metrics.mitigationRatio > 0.25) {
                elMitigation.className = 'metric-value text-amber-400 font-mono';
            } else {
                elMitigation.className = 'metric-value text-slate-300 font-mono';
            }
        }

        if (elKinEnergy) elKinEnergy.textContent = `${(physics.metrics.totalKineticEnergy * 1000).toFixed(1)} mJ`;
        if (elPotEnergy) elPotEnergy.textContent = `${(physics.metrics.totalPotentialEnergy * 1000).toFixed(1)} mJ`;

        if (elSolitonStatus) {
            if (physics.wall.force > 5) {
                elSolitonStatus.textContent = 'WAND-AUFPRALL';
                elSolitonStatus.style.color = '#ef4444';
            } else if (physics.striker.contactForce > 5) {
                elSolitonStatus.textContent = 'IMPULS-EINLEITUNG';
                elSolitonStatus.style.color = '#38bdf8';
            } else if (physics.metrics.totalKineticEnergy > 0.05) {
                elSolitonStatus.textContent = 'WELLENLAUF (HNSW)';
                elSolitonStatus.style.color = '#f59e0b';
            } else {
                elSolitonStatus.textContent = 'RUHEZUSTAND';
                elSolitonStatus.style.color = '#94a3b8';
            }
        }
    }

    // 5. Preset Switcher Controls
    const presetButtons = document.querySelectorAll('.preset-btn');
    const presetDesc = document.getElementById('preset-description');

    const presetDescriptions = {
        monodisperse: '<strong>Homogene Kette (Nesterenko-Soliton):</strong> 12 identische Wälzlager-Stahlkugeln. Ein einzelner, kompakter Solitonenpuls wandert ohne dispersive Verbreiterung durch das unkomprimierte Gitter ("Sonic Vacuum").',
        tapered: '<strong>Verjüngte Kette (Tapered Shock Absorber):</strong> Exponentiell abnehmende Radien (q = 0.91). Der massive Stoß wird in hochfrequente Mikroschwingungen zerlegt (Kinetic Energy Trapping). Gewaltige Impulsreduktion an der Wand!',
        diatomic: '<strong>Diatomisches Gitter (Bandlücke):</strong> Abwechselnd schwere Wolfram- und leichte Aluminiumkugeln. Erzeugt optische und akustische Phononenzweige – destruktive Interferenz filtert Schockwellenfrequenzen.',
        diode: '<strong>Akustische Diode (Asymmetrisch):</strong> Gestufte 3-Zonen-Kette. Stoß von links nach rechts absorbiert Schockimpulse effektiv; umgekehrt abgefeuert wird der Impuls fokussiert weitergegeben.',
        newton: '<strong>Newtons Wiege (Freies Ende):</strong> Klassischer Kugelstoß ohne Sensorwand. Das letzte Partikel hebt mit exakt der kinetischen Energie des Projektils ab.',
        defect: '<strong>Störstellen-Defekt (Elastomer-Kern):</strong> Eine weiche Polymerkugel im Zentrum reflektiert und bricht die Solitonenwelle.'
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
            reverse: state.diodeReversed
        });
        scene3d.syncWithPhysics();
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

    if (fireBtn) {
        fireBtn.addEventListener('click', () => {
            physics.reset(state.strikerSpeed);
            scene3d.syncWithPhysics();
            state.isRunning = true;
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            physics.reset(state.strikerSpeed);
            scene3d.syncWithPhysics();
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

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            state.isRunning = !state.isRunning;
            playPauseBtn.innerHTML = state.isRunning ?
                '<i class="ph-bold ph-pause"></i><span>Pause</span>' :
                '<i class="ph-bold ph-play"></i><span>Start</span>';
        });
    }

    if (stepBtn) {
        stepBtn.addEventListener('click', () => {
            state.isRunning = false;
            if (playPauseBtn) {
                playPauseBtn.innerHTML = '<i class="ph-bold ph-play"></i><span>Start</span>';
            }
            physics.update(0.016);
            scene3d.render();
            renderOscilloscope();
            updateMetricsUI();
        });
    }

    // Camera view presets
    const camIsoBtn = document.getElementById('cam-iso');
    const camFrontBtn = document.getElementById('cam-front');
    const camTopBtn = document.getElementById('cam-top');

    if (camIsoBtn) {
        camIsoBtn.addEventListener('click', () => {
            scene3d.camera.position.set(8.5, 6.5, 22.0);
            scene3d.controls.target.set(8.5, 0, 0);
        });
    }
    if (camFrontBtn) {
        camFrontBtn.addEventListener('click', () => {
            scene3d.camera.position.set(8.5, 1.2, 24.0);
            scene3d.controls.target.set(8.5, 0.5, 0);
        });
    }
    if (camTopBtn) {
        camTopBtn.addEventListener('click', () => {
            scene3d.camera.position.set(8.5, 26.0, 0.1);
            scene3d.controls.target.set(8.5, 0, 0);
        });
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

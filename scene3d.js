/**
 * Granular Metamaterial Shock Lab — 3D Scene Viewport (Three.js)
 * High-DPI WebGL renderer with V-groove rail, PBR materials,
 * dynamic emissive contact-glow, and mouse drag striker interaction.
 * 
 * Copyright (c) 2026 Walter (@xallace)
 * MIT License
 */

// Physics works in metres, the scene in centimetres
const SCENE_SCALE = 100;

class GranularScene3D {
    constructor(canvasContainer, physicsEngine) {
        this.container = canvasContainer;
        this.physics = physicsEngine;
        this.view = 'iso';
        this.onStrikerLaunch = null;     // callback(speed) after a drag release

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.beadMeshes = [];
        this.strikerMesh = null;
        this.wallMesh = null;
        this.railMesh = null;
        this.scaleTicks = [];

        // Interaction state for dragging striker
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDraggingStriker = false;
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.dragOffset = new THREE.Vector3();

        this.initThree();
        this.buildEnvironment();
        this.syncWithPhysics();
        this.setView('iso');
        this.setupEventListeners();
    }

    initThree() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x060913);
        this.scene.fog = new THREE.FogExp2(0x060913, 0.015);

        // Camera
        this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        this.camera.position.set(8.5, 6.5, 22.0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        // Orbit Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(8.5, 0, 0);
        this.controls.maxPolarAngle = Math.PI / 2 + 0.02; // Don't go deep under ground
        this.controls.minDistance = 5;
        this.controls.maxDistance = 60;

        // Lighting
        const ambient = new THREE.AmbientLight(0x1e293b, 1.8);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
        dirLight.position.set(12, 24, 16);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 60;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 30;
        dirLight.shadow.camera.top = 15;
        dirLight.shadow.camera.bottom = -15;
        dirLight.shadow.bias = -0.0003;
        this.scene.add(dirLight);

        // Secondary cyan rim light
        const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
        rimLight.position.set(-15, 8, -12);
        this.scene.add(rimLight);

        // Dynamic shock contact glow point light
        this.shockGlowLight = new THREE.PointLight(0xf59e0b, 0, 15);
        this.shockGlowLight.position.set(0, 2, 0);
        this.scene.add(this.shockGlowLight);
    }

    buildEnvironment() {
        // Floor grid
        const gridHelper = new THREE.GridHelper(80, 80, 0x1e293b, 0x0f172a);
        gridHelper.position.y = -2.2;
        this.scene.add(gridHelper);

        // Laboratory Work Table / Base Plate
        const tableGeo = new THREE.BoxGeometry(48, 1.2, 12);
        const tableMat = new THREE.MeshStandardMaterial({
            color: 0x0a0f1d,
            roughness: 0.6,
            metalness: 0.2
        });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(8.5, -1.6, 0);
        table.receiveShadow = true;
        this.scene.add(table);

        // Precision V-Groove Aluminum Rail
        const railLength = 40;
        const railShape = new THREE.Shape();
        railShape.moveTo(-1.6, 0);
        railShape.lineTo(-0.8, -0.6); // V groove
        railShape.lineTo(0.8, -0.6);
        railShape.lineTo(1.6, 0);
        railShape.lineTo(1.6, -0.8);
        railShape.lineTo(-1.6, -0.8);
        railShape.closePath();

        const extrudeSettings = {
            steps: 1,
            depth: railLength,
            bevelEnabled: true,
            bevelThickness: 0.08,
            bevelSize: 0.08,
            bevelSegments: 3
        };

        const railGeo = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
        railGeo.center();
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            metalness: 0.82,
            roughness: 0.25
        });
        this.railMesh = new THREE.Mesh(railGeo, railMat);
        this.railMesh.rotation.y = Math.PI / 2;
        this.railMesh.position.set(8.5, -0.6, 0);
        this.railMesh.receiveShadow = true;
        this.railMesh.castShadow = true;
        this.scene.add(this.railMesh);

        // Laser-etched millimeter scale ticks along the rail
        const tickMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
        for (let x = -10; x <= 26; x += 1.0) {
            const isMajor = Math.abs(x % 5) < 0.01;
            const tickH = isMajor ? 0.35 : 0.18;
            const tickGeo = new THREE.BoxGeometry(0.04, tickH, 0.02);
            const tick = new THREE.Mesh(tickGeo, tickMat);
            tick.position.set(x, -0.55 + tickH / 2, 1.62);
            this.scene.add(tick);
            this.scaleTicks.push(tick);
        }

        // Rigid Sensor Wall / Load Cell fixture at the end
        const wallGroup = new THREE.Group();

        // Heavy steel backplate
        const wallBackGeo = new THREE.BoxGeometry(0.6, 4.5, 4.5);
        const wallBackMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            metalness: 0.9,
            roughness: 0.3
        });
        const wallBack = new THREE.Mesh(wallBackGeo, wallBackMat);
        wallBack.castShadow = true;
        wallBack.receiveShadow = true;
        wallGroup.add(wallBack);

        // Piezoelectric load cell cylinder
        const sensorGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.35, 32);
        const sensorMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            metalness: 0.6,
            roughness: 0.2,
            emissive: 0x0284c7,
            emissiveIntensity: 0.25
        });
        const sensor = new THREE.Mesh(sensorGeo, sensorMat);
        sensor.rotation.z = Math.PI / 2;
        sensor.position.x = -0.3;
        wallGroup.add(sensor);

        // Impact contact pad
        const padGeo = new THREE.BoxGeometry(0.12, 2.4, 2.4);
        const padMat = new THREE.MeshStandardMaterial({
            color: 0xf1f5f9,
            metalness: 0.95,
            roughness: 0.1
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.x = -0.5;
        wallGroup.add(pad);

        this.wallMesh = wallGroup;
        this.scene.add(this.wallMesh);
    }

    /**
     * Builds and synchronizes Three.js sphere meshes with physics engine beads
     */
    syncWithPhysics() {
        // Clear previous bead meshes
        for (let mesh of this.beadMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.beadMeshes = [];

        if (this.strikerMesh) {
            this.scene.remove(this.strikerMesh);
            this.strikerMesh.geometry.dispose();
            this.strikerMesh.material.dispose();
            this.strikerMesh = null;
        }

        // Shared high-poly sphere geometry template
        const sphereGeoTemplate = new THREE.SphereGeometry(1, 48, 36);

        // Build Striker Mesh
        const striker = this.physics.striker;
        const strikerGeo = sphereGeoTemplate.clone();
        const sr = striker.r * SCENE_SCALE;
        strikerGeo.scale(sr, sr, sr);

        const strikerMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,           // Cyan tinted hardened impactor
            metalness: 0.92,
            roughness: 0.14,
            emissive: new THREE.Color(0x000000)
        });
        this.strikerMesh = new THREE.Mesh(strikerGeo, strikerMat);
        this.strikerMesh.castShadow = true;
        this.strikerMesh.receiveShadow = true;
        this.strikerMesh.userData = { isStriker: true };
        this.scene.add(this.strikerMesh);

        // Build Chain Bead Meshes
        for (let i = 0; i < this.physics.beads.length; i++) {
            const b = this.physics.beads[i];
            const geo = sphereGeoTemplate.clone();
            const br = b.r * SCENE_SCALE;
            geo.scale(br, br, br);

            let baseColor = 0x94a3b8;
            let metalness = 0.88;
            let roughness = 0.18;

            if (b.material === 'tungsten') {
                baseColor = 0x334155;
                metalness = 0.95;
                roughness = 0.22;
            } else if (b.material === 'aluminum') {
                baseColor = 0xe2e8f0;
                metalness = 0.70;
                roughness = 0.30;
            } else if (b.material === 'ptfe') {
                baseColor = 0xf43f5e;
                metalness = 0.05;
                roughness = 0.55;
            }

            const mat = new THREE.MeshStandardMaterial({
                color: baseColor,
                metalness: metalness,
                roughness: roughness,
                emissive: new THREE.Color(0x000000)
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { beadIndex: i };

            this.scene.add(mesh);
            this.beadMeshes.push(mesh);
        }

        // Position wall: front face of the contact pad (0.56 left of the group origin) touches the last bead
        if (this.wallMesh) {
            this.wallMesh.visible = this.physics.wall.enabled;
            this.wallMesh.position.set(this.physics.wall.x * SCENE_SCALE + 0.56, 0.4, 0);
        }
    }

    /**
     * Camera presets framed on the current chain (striker pull-back range to wall)
     */
    setView(view) {
        this.view = view;
        const p = this.physics;
        const last = p.beads[p.beads.length - 1];
        const xMin = (p.striker.x - p.striker.r) * SCENE_SCALE - 4;
        const xMax = p.wall.enabled ? p.wall.x * SCENE_SCALE + 4 : (last.x + last.r) * SCENE_SCALE + 4;
        const cx = (xMin + xMax) / 2;
        const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
        const hHalfFov = Math.atan(Math.tan(halfFov) * this.camera.aspect);
        const dist = (xMax - xMin) / 2 / Math.tan(hHalfFov) * 1.05;

        if (view === 'front') {
            this.camera.position.set(cx, 1.2, dist);
            this.controls.target.set(cx, 0.8, 0);
        } else if (view === 'top') {
            this.camera.position.set(cx, dist, 0.1);
            this.controls.target.set(cx, 0, 0);
        } else {
            this.camera.position.set(cx, dist * 0.32, dist * 0.95);
            this.controls.target.set(cx, 0, 0);
        }
        this.controls.update();
    }

    /**
     * Mouse & Touch Drag Controls for Pulling the Striker
     */
    setupEventListeners() {
        const dom = this.renderer.domElement;

        const onPointerDown = (e) => {
            const rect = dom.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.strikerMesh);

            if (intersects.length > 0) {
                this.isDraggingStriker = true;
                this.controls.enabled = false; // Disable orbit rotate while dragging ball
                this.physics.reset();          // Chain back to rest before a new shot

                const intersectPoint = new THREE.Vector3();
                this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
                this.dragOffset.x = this.strikerMesh.position.x - intersectPoint.x;

                dom.style.cursor = 'grabbing';
            }
        };

        const onPointerMove = (e) => {
            if (!this.isDraggingStriker) {
                const rect = dom.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObject(this.strikerMesh);
                dom.style.cursor = intersects.length > 0 ? 'grab' : 'default';
                return;
            }

            const rect = dom.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersectPoint = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
                // Scene centimetres -> physics metres; pull back at most 10 cm, never into bead 0
                const first = this.physics.beads[0];
                const contactX = first.x - first.r - this.physics.striker.r;
                const targetX = (intersectPoint.x + this.dragOffset.x) / SCENE_SCALE;
                this.physics.striker.x = Math.max(contactX - 0.10, Math.min(contactX - 0.0005, targetX));
                this.physics.striker.v = 0;
                this.physics.striker.a = 0;
            }
        };

        const onPointerUp = () => {
            if (this.isDraggingStriker) {
                this.isDraggingStriker = false;
                this.controls.enabled = true;
                dom.style.cursor = 'default';

                // Release striker: 1 cm pull-back = 1 m/s, 1 ... 10 m/s like the slider
                const first = this.physics.beads[0];
                const pullCm = (first.x - first.r - this.physics.striker.r - this.physics.striker.x) * SCENE_SCALE;
                if (pullCm > 0.2) {
                    const launchSpeed = Math.round(Math.min(10, Math.max(1, pullCm)) * 5) / 5;
                    this.physics.launchFrom(this.physics.striker.x, launchSpeed);
                    if (this.onStrikerLaunch) this.onStrikerLaunch(launchSpeed);
                }
            }
        };

        dom.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        // Window resize
        window.addEventListener('resize', () => {
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
            this.setView(this.view);
        });
    }

    /**
     * Animation frame render loop: updates mesh positions and dynamic stress-glow
     */
    render() {
        this.controls.update();

        // 1. Update Striker Mesh
        const s = this.physics.striker;
        this.strikerMesh.position.set(s.x * SCENE_SCALE, s.r * SCENE_SCALE, 0);

        // Rotate striker around Z axis as it rolls along rail
        this.strikerMesh.rotation.z = -s.x / s.r;

        // Striker stress glow
        if (s.stressGlow > 0.01) {
            this.strikerMesh.material.emissive.setRGB(
                s.stressGlow * 1.0,
                s.stressGlow * 0.45,
                s.stressGlow * 0.1
            );
        } else {
            this.strikerMesh.material.emissive.set(0x000000);
        }

        // 2. Update Chain Bead Meshes
        let maxStress = 0;
        let stressFocusX = s.x;

        for (let i = 0; i < this.physics.beads.length; i++) {
            const b = this.physics.beads[i];
            const mesh = this.beadMeshes[i];

            mesh.position.set(b.x * SCENE_SCALE, b.r * SCENE_SCALE, 0);
            mesh.rotation.z = -b.x / b.r;

            // Apply Dynamic Hertzian Stress Glow
            if (b.stressGlow > 0.02) {
                // Color ramp: Cyan -> Amber -> Hot White
                const glow = b.stressGlow;
                mesh.material.emissive.setRGB(
                    glow * 1.0,
                    glow * 0.55,
                    glow * 0.15
                );
                if (glow > maxStress) {
                    maxStress = glow;
                    stressFocusX = b.x * SCENE_SCALE;
                }
            } else {
                mesh.material.emissive.set(0x000000);
            }
        }

        // Dynamic light follows the peak of the solitary wave
        if (maxStress > 0.05) {
            this.shockGlowLight.intensity = maxStress * 3.5;
            this.shockGlowLight.position.set(stressFocusX, 2.5, 1.5);
        } else {
            this.shockGlowLight.intensity *= 0.85;
        }

        // 3. Sensor Wall pulse
        if (this.wallMesh) {
            const wallForceNorm = Math.min(1.0, this.physics.wall.force / this.physics.metrics.referenceForce);
            const sensor = this.wallMesh.children[1];
            if (sensor) {
                if (wallForceNorm > 0.05) {
                    sensor.material.emissive.setRGB(wallForceNorm * 1.0, 0, 0);
                    sensor.material.emissiveIntensity = 0.5 + wallForceNorm * 1.5;
                } else {
                    sensor.material.emissive.set(0x0284c7);
                    sensor.material.emissiveIntensity = 0.25;
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Export for browser
window.GranularScene3D = GranularScene3D;

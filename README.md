<div align="center">

# 🧱 Granular Metamaterial Shock Lab
### Interactive 3D Simulation of Solitary Waves and Shock Transmission in Hertzian Sphere Chains

[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-38bdf8?style=for-the-badge&logo=github)](https://xallace.github.io/metamaterial-shock-lab/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](LICENSE)
[![Platform: WebGL](https://img.shields.io/badge/Platform-Three.js_r128_WebGL-6366f1?style=for-the-badge)](https://threejs.org)
[![Hertzian Contact](https://img.shields.io/badge/Mechanics-Hertzian_Contact_Theory-f59e0b?style=for-the-badge)](#mathematical-formulations)

*A 1D chain of elastic spheres in SI units, checked against the Hertz impact solution and Nesterenko's solitary wave.*

[**🚀 Launch Live 3D Lab**](https://xallace.github.io/metamaterial-shock-lab/) • [**📐 Mathematical Formulations**](#mathematical-formulations) • [**🧪 Chain Presets**](#chain-presets) • [**✅ Verification**](#verification)

</div>

---

## 🌟 Overview

Granular crystals are ordered arrays of elastic particles that interact through nonlinear Hertzian contact.

Spheres cannot carry tension (they separate, $F = 0$), so a chain of touching spheres without precompression has a linear sound speed of zero. Nesterenko called this state the **"sonic vacuum"**.

An impact on such a chain does not produce ordinary acoustic waves. It forms a **solitary wave**, a compact pulse about five sphere diameters wide that travels without decay.

The lab simulates a striker sphere hitting six chain types (see presets) and measures the peak contact force at the input and at a rigid wall behind the chain.

---

## 📐 Mathematical Formulations

### 1. Hertzian Contact
For two spheres with radii $R_i, R_{i+1}$, Young's moduli $E_i, E_{i+1}$ and Poisson's ratios $\nu_i, \nu_{i+1}$:

$$\delta_{i, i+1} = \max\left(0, (R_i + R_{i+1}) - (x_{i+1} - x_i)\right), \qquad F_{i, i+1} = A_{i, i+1} \cdot \delta_{i, i+1}^{3/2}$$

$$A = \frac{4}{3} E^* \sqrt{R^*}, \qquad \frac{1}{R^*} = \frac{1}{R_i} + \frac{1}{R_{i+1}}, \qquad \frac{1}{E^*} = \frac{1 - \nu_i^2}{E_i} + \frac{1 - \nu_{i+1}^2}{E_{i+1}}$$

The wall is a rigid flat steel plate (sphere on flat: $R^* = R$).

### 2. Equations of Motion
$$m_i \ddot{x}_i = F_{i-1, i} - F_{i, i+1}$$

The model has no damping, so the total energy $\sum \tfrac{1}{2} m v^2 + \sum \tfrac{2}{5} A \delta^{5/2}$ stays constant and serves as a check of the integrator (velocity Verlet, step ≤ 0.1 µs).

### 3. Solitary Wave Speed (Nesterenko, long-wave approximation)
$$V_s = \frac{2}{\sqrt{5}}\, c\, \xi_m^{1/4}, \qquad c^2 = \frac{2E}{\pi \rho (1 - \nu^2)}, \qquad \xi_m = \frac{\delta_m}{2R}$$

Stronger impacts travel faster: $V_s \propto F_{\max}^{1/6}$.

### 4. Speed Independence of the Force Ratios
With pure Hertz contacts the solution scales with the striker speed $v_0$ (forces $\propto v_0^{6/5}$, times $\propto v_0^{-1/5}$). The ratio $F_\text{wall}/F_\text{in}$ of a chain therefore does not depend on $v_0$.

---

## 🧪 Chain Presets

Striker: steel sphere Ø 20 mm. $F_\text{wall}/F_\text{in}$ from the simulation (`tests/verify.mjs`).

| Preset | Topology | $F_\text{wall}/F_\text{in}$ | Observation |
| :--- | :--- | :---: | :--- |
| **1. Homogeneous chain** | 12 steel spheres Ø 20 mm | 1.64 | Solitary wave, 5 spheres wide, about 940 m/s at 5 m/s; reflection at the rigid wall raises the force |
| **2. Tapered chain** | Radii shrink by $q = 0.91$ per sphere (Ø 20 → 7 mm) | 0.92 | Wall force 44 % lower than in the homogeneous chain at the same impact |
| **3. Stepped chain** | 4 × Ø 23, 4 × Ø 17, 4 × Ø 12 mm | 0.93 / 2.43 | Large → small vs. small → large; reversed, the input force halves but the wall force rises (8.7 vs. 7.4 kN at 5 m/s) |
| **4. Diatomic chain** | Alternating tungsten carbide Ø 21 mm and aluminium Ø 14.4 mm (mass ratio ≈ 17 : 1) | 0.51 | The wave reaches the wall later (480 vs. 383 µs at 5 m/s) |
| **5. PTFE defect** | Steel chain with one PTFE sphere Ø 16 mm at the center | 0.47 | PTFE is about 140 times softer than steel; no damping in the model |
| **6. Newton's cradle** | 8 steel spheres, free end | – | The last sphere leaves with 98.6 % of the striker speed (97 % of the energy); the rest stays in the chain |

Material data (typical handbook values): steel E = 210 GPa, ν = 0.30, ρ = 7850 kg/m³; tungsten carbide 600 GPa, 0.22, 15 000 kg/m³; aluminium 70 GPa, 0.33, 2700 kg/m³; PTFE 1.46 GPa, 0.46, 2200 kg/m³.

---

## ✅ Verification

```bash
node tests/verify.mjs
```

| Check | Result |
| :--- | :--- |
| Two-sphere Hertz impact, peak force | 6936 N, closed form 6936 N |
| Two-sphere Hertz impact, contact time ($t_c = 2.943\,\delta_{max}/v$) | 43.70 µs, closed form 43.60 µs |
| Equal masses exchange velocities | 5.0000 / 0.0000 m/s |
| Solitary wave speed, 40-sphere steel chain at 5 m/s | 940 m/s, Nesterenko 929 m/s (1.2 %) |
| Solitary wave without decay | 5881 N at sphere 16 and sphere 31 |
| Wave width | 5 spheres above 0.1 % of the peak velocity |
| Energy conservation, all presets over 3 ms | error < 0.001 % |
| Newton's cradle momentum | conserved to 1e-6 |

---

## ✨ Features

* **Time scale:** 10 ms, 1 ms, 100 µs or 10 µs of simulated time per real second. The wave needs 0.2 to 0.8 ms to reach the wall. The free flight of the striker up to 1 mm before the chain is skipped.
* **Mouse drag:** pull the striker back (1 cm = 1 m/s, 1 to 10 m/s); the speed slider follows.
* **Stress glow:** spheres glow in proportion to their contact force, scaled to the predicted first-impact force.
* **Oscilloscope:** peak force per frame for the striker contact ($F_\text{in}$), the chain center and the wall, with the simulated time span of the window.
* **Metrics:** peak forces, $F_\text{wall}/F_\text{in}$, kinetic and elastic energy in mJ, simulated time.

---

## 🛠️ Local Development

Open `index.html` in a browser, or serve the folder:

```bash
git clone https://github.com/xallace/metamaterial-shock-lab.git
cd metamaterial-shock-lab
python -m http.server 8000   # then open http://localhost:8000
node tests/verify.mjs        # physics checks (Node 18+)
```

No package manager or build pipeline required.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
Copyright © 2026 Walter (@xallace).

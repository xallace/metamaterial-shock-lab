<div align="center">

# 🧱 Granular Metamaterial Shock Lab
### Interactive 3D Simulation of Nonlinear Hertzian Solitons, Tapered Granular Chains & Acoustic Diodes

[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-38bdf8?style=for-the-badge&logo=github)](https://xallace.github.io/metamaterial-shock-lab/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](LICENSE)
[![Platform: WebGL](https://img.shields.io/badge/Platform-Three.js_r128_WebGL-6366f1?style=for-the-badge)](https://threejs.org)
[![Acoustics & Solids](https://img.shields.io/badge/Mechanics-Hertzian_Contact_Theory-f59e0b?style=for-the-badge)](#astronomical-formulations)
[![Zero Build Steps](https://img.shields.io/badge/Dependencies-Zero_Vanilla_ES6-10b981?style=for-the-badge)](https://developer.mozilla.org)

*A high-fidelity mechanical engineering laboratory modeling discrete particle lattices, sonic vacuum dynamics, and shock mitigation structures.*

[**🚀 Launch Live 3D Lab**](https://xallace.github.io/metamaterial-shock-lab/) • [**📐 Mathematical Formulations**](#mathematical-formulations) • [**🧪 Chain Presets**](#chain-presets) • [**🛠️ FEA & LS-DYNA Relevance**](#fea--ls-dyna-relevance)

</div>

---

## 🌟 Overview

Granular metamaterials (also known as **granular crystals**) consist of ordered arrays of elastic particles interacting through non-linear Hertzian contact. 

Because spheres cannot sustain tensile loads (they separate under tension with $F = 0$), uncompressed chains exhibit a vanishing linear sound speed ($c_0 = 0$). This state is famously known in continuum and nonlinear physics as the **"Sonic Vacuum"** (V. F. Nesterenko, 1983).

When struck by an impactor, the lattice does not support conventional dispersive acoustic waves. Instead, mechanical energy organizes into **Highly Nonlinear Solitary Waves (HNSWs)**—compact, stable solitary pulses whose width is independent of amplitude and spans only $\sim 5$ particle diameters.

This laboratory provides an interactive 3D WebGL testbench to simulate:
1. Pure **Nesterenko Soliton propagation** in monodisperse lattices.
2. **Shock mitigation & kinetic energy trapping** in tapered chains ($> 70\%$ peak force attenuation).
3. **Acoustic Diode rectification** (unidirectional wave transmission).
4. **Phononic bandgaps** in diatomic lattices.

---

## 📐 Mathematical Formulations

### 1. Discrete Hertzian Contact Mechanics
For two spherical particles $i$ and $i+1$ of radii $R_i, R_{i+1}$, Young's moduli $E_i, E_{i+1}$, and Poisson's ratios $\nu_i, \nu_{i+1}$, the contact force $F$ depends on mutual compressive indentation $\delta_{i, i+1}$:

$$\delta_{i, i+1} = \max\left(0, (R_i + R_{i+1}) - (x_{i+1} - x_i)\right)$$

$$F_{i, i+1} = A_{i, i+1} \cdot \delta_{i, i+1}^{3/2}$$

The contact stiffness coefficient $A$ is given by:

$$A_{i, i+1} = \frac{4}{3} E^* \sqrt{R^*}$$

Where the effective radius $R^*$ and effective modulus $E^*$ are:

$$\frac{1}{R^*} = \frac{1}{R_i} + \frac{1}{R_{i+1}}, \quad \frac{1}{E^*} = \frac{1 - \nu_i^2}{E_i} + \frac{1 - \nu_{i+1}^2}{E_{i+1}}$$

### 2. Equations of Motion (1D Chain)
For an array of $N$ beads of mass $m_i$:

$$m_i \frac{d^2 x_i}{dt^2} = F_{i-1, i} - F_{i, i+1} - b_{\text{air}} \frac{dx_i}{dt}$$

Where $b_{\text{air}}$ represents slight ambient drag and contact viscoelastic damping.

### 3. Nesterenko Soliton Velocity Scaling
The propagation velocity $V_s$ of a solitary wave in a monodisperse chain depends strictly on its maximum dynamic contact force $F_{\max}$:

$$V_s = \frac{2}{\sqrt{\pi}} \left(\frac{A}{m}\right)^{1/3} \left(\frac{F_{\max}}{A}\right)^{1/6} \propto F_{\max}^{1/6}$$

Unlike linear acoustics, **stronger shocks travel faster** through granular media.

### 4. Shock Mitigation in Tapered Chains
By introducing a geometric radius gradient $R_{n+1} = q \cdot R_n$ ($q < 1$), particle mass scales as $m_n \propto q^{3n}$. As the solitary wave enters smaller beads, impedance mismatches generate significant backward reflections. 

The initial coherent solitary wave disintegrates into high-frequency incoherent oscillations, dramatically reducing the transmitted peak force against the backing wall:

$$\eta_{\text{mitigation}} = 1 - \frac{F_{\text{wall, peak}}}{F_{\text{incident, peak}}}$$

---

## 🧪 Chain Presets

| Preset | Topology | Physical Phenomenon |
| :--- | :--- | :--- |
| **1. Homogeneous Chain** | 12 identical 100Cr6 steel beads | Pure **Nesterenko Soliton (HNSW)** traveling with zero dispersion. |
| **2. Tapered Chain** | Radii decrease geometrically ($q = 0.91$) | **Kinetic Energy Trapping**: Incident shock breaks into high-frequency oscillations ($\eta > 70\%$). |
| **3. Acoustic Diode** | Asymmetric 3-stage stepped chain | **Wave Rectification**: Impact from left absorbs energy; impact from right transmits focused momentum. |
| **4. Diatomic Lattice** | Alternating tungsten ($2.45\times$) & aluminum ($0.35\times$) | **Phononic Bandgap**: Wave scattering and destructive interference. |
| **5. Elastomer Defect** | Soft polymer bead at lattice center | Localized solitary wave reflection & impedance mismatch. |
| **6. Newton's Cradle** | Unbounded chain without rigid sensor wall | Pure momentum transfer with terminal particle ejection. |

---

## ✨ Features & Visual Feedback

* **Interactive 3D Mouse Drag:** Click and pull the striker projectile backward in 3D space to prime an impact at any velocity.
* **Dynamic Stress Glow:** Spheres illuminate from cold steel-cyan to incandescent amber/white proportional to the instantaneous Hertzian contact stress tensor.
* **Dual Real-time Oscilloscope:** High-rate 2D canvas displaying simultaneous contact force curves:
  - 🔵 **Cyan:** Incident striker impact ($F_{\text{in}}$)
  - 🟡 **Amber:** Core solitary wave amplitude ($F_{\text{center}}$)
  - 🔴 **Crimson:** Transmitted shock force at the rigid piezo sensor wall ($F_{\text{wall}}$)
* **Energy Balance Monitor:** Continuous tracking of kinetic ($E_{\text{kin}} = \sum \frac{1}{2}m v^2$) and elastic potential ($E_{\text{pot}} = \sum \frac{2}{5}A\delta^{5/2}$) energy.
* **Symplectic Verlet Integration:** 45 sub-steps per animation frame ensuring numerical stability through the stiff non-linear $3/2$ contact exponent.

---

## 🛠️ Local Development

Clone the repository and launch directly in any modern browser:

```bash
git clone https://github.com/xallace/metamaterial-shock-lab.git
cd metamaterial-shock-lab
# Open index.html in your browser
start index.html   # Windows
open index.html    # macOS
xdg-open index.html # Linux
```

No package manager or build pipeline required.

---

## 📄 License

Distributed under the [MIT License](LICENSE).  
Copyright © 2026 Walter (@xallace).

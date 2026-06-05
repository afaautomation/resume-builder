import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

export function initBackground() {
    const isMobile = window.innerWidth <= 768 || window.matchMedia("(max-width: 768px)").matches || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const bgContainer = document.getElementById('webgl-bg');
    
    if (isMobile) {
        if (bgContainer) {
            bgContainer.style.background = 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #020205 100%)';
        }
        return; // Skip loading Three.js entirely on mobile to save battery and CPU
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020205, 0.005);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(-60, 0, 160);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x020205, 1);
    
    const bgContainer = document.getElementById('webgl-bg');
    if (!bgContainer) return;
    bgContainer.appendChild(renderer.domElement);

    // Post-Processing (Bloom effect)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.1);
    composer.addPass(bloomPass);

    // Helper objects for instances
    const dummyObj = new THREE.Object3D();
    const colorHelper = new THREE.Color();
    const targetPos = new THREE.Vector3();

    // ==========================================
    // 1. SLIDE 1: PARTICLE LOGO (At Y = 0)
    // ==========================================
    const logoGroup = new THREE.Group();
    logoGroup.position.y = 0;
    scene.add(logoGroup);

    const NUM_LOGO_PARTICLES = 40000; // Reduced for performance
    const logoMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshBasicMaterial({ color: 0xffffff }), NUM_LOGO_PARTICLES);
    logoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    logoGroup.add(logoMesh);

    const logoPositions = [];
    const logoVelocities = [];
    let targetLogoPoints = [];

    // Initialize logo particles with random positions
    for (let i = 0; i < NUM_LOGO_PARTICLES; i++) {
        logoPositions.push(new THREE.Vector3((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300));
        logoVelocities.push(new THREE.Vector3(0, 0, 0));
        logoMesh.setColorAt(i, colorHelper.setHex(0x6366f1)); // Use project primary color
    }

    // Load Image and map pixel data to 3D coordinates
    const img = new Image();
    img.src = 'logo.png';
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const w = 400;
        const h = w / (img.width / img.height);
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);

        const pixelData = ctx.getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y += 1) { // Step by 1 for density
            for (let x = 0; x < w; x += 1) {
                // Check alpha channel
                if (pixelData[(y * w + x) * 4 + 3] > 100) {
                    targetLogoPoints.push({
                        x: (x - w / 2) * 0.45,
                        y: -(y - h / 2) * 0.45,
                        z: (Math.random() - 0.5) * 1.5
                    });
                }
            }
        }
        // Shuffle points to distribute particles randomly
        targetLogoPoints.sort(() => Math.random() - 0.5);
    };

    // ==========================================
    // 2. SLIDE 2: CYBER OCEAN (At Y = -300)
    // ==========================================
    const oceanGroup = new THREE.Group();
    oceanGroup.position.y = -300;
    scene.add(oceanGroup);

    const NUM_OCEAN_PILLARS = 6400; // 80x80 grid
    const oceanMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 }), NUM_OCEAN_PILLARS);
    oceanMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oceanGroup.add(oceanMesh);

    // Ocean Lighting
    oceanGroup.add(new THREE.AmbientLight(0xffffff, 0.4));
    const pointLight1 = new THREE.PointLight(0x6366f1, 400, 150);
    pointLight1.position.set(0, 20, 0);
    oceanGroup.add(pointLight1);
    const pointLight2 = new THREE.PointLight(0x4f46e5, 400, 40);
    oceanGroup.add(pointLight2);

    const oceanHeights = new Float32Array(NUM_OCEAN_PILLARS);

    // ==========================================
    // 3. GLOBAL BACKGROUND: FACE FILTER (Liquefied Identity)
    // ==========================================
    const faceGroup = new THREE.Group();
    scene.add(camera);
    camera.add(faceGroup);
    faceGroup.position.set(0, 0, -400); 
    faceGroup.scale.set(8, 8, 8); 

    const NUM_FACE_PARTICLES = 15000;
    const faceMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending }), NUM_FACE_PARTICLES);
    faceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    faceGroup.add(faceMesh);

    const facePositions = [];
    for (let i = 0; i < NUM_FACE_PARTICLES; i++) {
        facePositions.push(new THREE.Vector3((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100));
    }

    // ==========================================
    // 4. INTERACTION & CAMERA LOGIC
    // ==========================================
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    const mouseWorld3D = new THREE.Vector3();

    window.addEventListener('mousemove', e => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.onresize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    };

    let targetCamPos = new THREE.Vector3(-60, 0, 160);
    let targetLookAt = new THREE.Vector3(-60, 0, 0);
    let currentLookAt = new THREE.Vector3(-60, 0, 0);

    let scrollProgress = 0;
    let targetScrollProgress = 0;

    window.updateBackgroundView = (viewName) => {
        if (viewName === 'landing') targetScrollProgress = 0;
        else if (viewName === 'templates') targetScrollProgress = 1.5;
        else if (viewName === 'editor') targetScrollProgress = 3;
    };

    window.addEventListener('scroll', () => {
        // Adjust scroll progress mapping based on the app's content height
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 0) {
            scrollProgress = (window.scrollY / maxScroll) * 3; 
        }
    });

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        
        // Smoothly interpolate scrollProgress towards target
        scrollProgress += (targetScrollProgress - scrollProgress) * 0.05;
        const p = scrollProgress;

        // --- Physical Camera Flight based on Scroll ---
        if (p <= 1) {
            targetCamPos.lerpVectors(new THREE.Vector3(-60, 0, 160), new THREE.Vector3(0, -265, 50), p);
            targetLookAt.lerpVectors(new THREE.Vector3(-60, 0, 0), new THREE.Vector3(0, -300, 0), p);
            bloomPass.strength = 1.2 - 0.2 * p;
        } else if (p <= 2) {
            const p2 = (p - 1);
            targetCamPos.lerpVectors(new THREE.Vector3(0, -265, 50), new THREE.Vector3(0, -600, 100), p2);
            targetLookAt.lerpVectors(new THREE.Vector3(0, -300, 0), new THREE.Vector3(0, -600, 0), p2);
        } else {
            const p3 = (p - 2);
            targetCamPos.lerpVectors(new THREE.Vector3(0, -600, 100), new THREE.Vector3(0, -900, 100), p3);
            targetLookAt.lerpVectors(new THREE.Vector3(0, -600, 0), new THREE.Vector3(0, -900, 0), p3);
        }

        const driftX = Math.sin(t * 0.2) * 5;
        const driftY = Math.cos(t * 0.15) * 5;

        camera.position.lerp(new THREE.Vector3(targetCamPos.x + driftX, targetCamPos.y + driftY, targetCamPos.z), 0.05);
        currentLookAt.lerp(targetLookAt, 0.05);
        camera.lookAt(currentLookAt);

        // --- Update Logic: Logo ---
        if (p < 1.5) {
            raycaster.setFromCamera(mouse, camera);
            raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), mouseWorld3D);

            for (let i = 0; i < NUM_LOGO_PARTICLES; i++) {
                if (targetLogoPoints.length > 0) {
                    const pt = targetLogoPoints[i % targetLogoPoints.length];
                    let tx = pt.x, ty = pt.y, tz = pt.z;

                    if (mouse.x !== -999) {
                        const dx = tx - mouseWorld3D.x;
                        const dy = ty - mouseWorld3D.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 25) {
                            const force = Math.pow((25 - dist) / 25, 2);
                            tx += (dx / dist) * force * 30;
                            ty += (dy / dist) * force * 30;
                        }
                    }

                    targetPos.set(tx, ty, tz);
                    const v = logoVelocities[i];
                    v.x += (tx - logoPositions[i].x) * 0.08;
                    v.y += (ty - logoPositions[i].y) * 0.08;
                    v.z += (tz - logoPositions[i].z) * 0.08;
                    v.multiplyScalar(0.8);
                    logoPositions[i].add(v);

                    const energy = Math.min(1, v.length() * 0.4);
                    colorHelper.setHSL(0.65 - energy * 0.1, 0.8, 0.4 + energy * 0.4);
                }

                dummyObj.position.copy(logoPositions[i]);
                dummyObj.updateMatrix();
                logoMesh.setMatrixAt(i, dummyObj.matrix);
                logoMesh.setColorAt(i, colorHelper);
            }
            logoMesh.instanceMatrix.needsUpdate = true;
            logoMesh.instanceColor.needsUpdate = true;
        }

        // --- Update Logic: Cyber Ocean ---
        if (p > 0.5 && p < 2.5) {
            raycaster.setFromCamera(mouse, camera);
            raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -300), mouseWorld3D);

            if (mouse.x !== -999) {
                pointLight2.position.lerp(new THREE.Vector3(mouseWorld3D.x, 8, mouseWorld3D.z), 0.1);
            }

            let idx = 0;
            const grid = 80;
            for (let x = 0; x < grid; x++) {
                for (let z = 0; z < grid; z++) {
                    const px = x * 1.5 - (grid * 0.75);
                    const pz = z * 1.5 - (grid * 0.75);

                    let waveHeight = Math.sin(Math.sqrt(px * px + pz * pz) * 0.15 - t * 1.5) * 2.5;

                    if (mouse.x !== -999) {
                        const dx = px - mouseWorld3D.x;
                        const dz = pz - mouseWorld3D.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist < 12) {
                            waveHeight += Math.pow((12 - dist) / 12, 2) * 12;
                        }
                    }

                    oceanHeights[idx] += (waveHeight - oceanHeights[idx]) * 0.15;
                    const finalHeight = Math.max(0.1, oceanHeights[idx] + 4);

                    dummyObj.position.set(px, finalHeight / 2 - 8, pz);
                    dummyObj.scale.set(1, finalHeight, 1);
                    dummyObj.updateMatrix();
                    oceanMesh.setMatrixAt(idx, dummyObj.matrix);

                    if (oceanHeights[idx] > 3) {
                        const mix = Math.min(1, (oceanHeights[idx] - 3) / 8);
                        colorHelper.setHSL(0.6 - mix * 0.1, 0.8, 0.1 + mix * 0.5);
                    } else {
                        colorHelper.setHSL(0.62, 0.8, 0.05);
                    }

                    oceanMesh.setColorAt(idx, colorHelper);
                    idx++;
                }
            }
            oceanMesh.instanceMatrix.needsUpdate = true;
            oceanMesh.instanceColor.needsUpdate = true;
        }

        // --- Update Logic: Face/Noise ---
        for (let i = 0; i < NUM_FACE_PARTICLES; i++) {
            const pos = facePositions[i];
            const noise = Math.sin(t * 0.5 + pos.x * 0.1) * Math.cos(t * 0.3 + pos.y * 0.1);
            dummyObj.position.set(pos.x + noise * 2, pos.y + noise * 2, pos.z + noise * 5);
            dummyObj.rotation.set(t * 0.5, t * 0.3, 0);
            dummyObj.updateMatrix();
            faceMesh.setMatrixAt(i, dummyObj.matrix);
        }
        faceMesh.instanceMatrix.needsUpdate = true;

        composer.render();
    }

    animate();
}

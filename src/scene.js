import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight, seededRandom, daylight } from './world.js';
import { skyVertex, skyFragment, oceanVertex, oceanFragment } from './shaders.js';

export function createBeach(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 550);
  camera.rotation.order = 'YXZ';
  const random = seededRandom(25);
  const hemisphere = new THREE.HemisphereLight(0xd8f8ff, 0xb6a476, 2.1);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff2d2, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 35, bottom: -20, near: 0.5, far: 110 });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, 0, 10);
  scene.add(sun, sun.target);

  const uniforms = {
    time: { value: 0 }, day: { value: 1 },
    sunDirection: { value: new THREE.Vector3(-0.5, 0.55, -0.65).normalize() },
    skyTop: { value: new THREE.Color('#2b91c4') }, skyHorizon: { value: new THREE.Color('#c7e8df') },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false,
  }));
  scene.add(dome);
  const oceanGeo = new THREE.PlaneGeometry(440, 300, 160, 120);
  oceanGeo.rotateX(-Math.PI / 2);
  oceanGeo.translate(0, 0, -143);
  const ocean = new THREE.Mesh(oceanGeo, new THREE.ShaderMaterial({ uniforms, vertexShader: oceanVertex, fragmentShader: oceanFragment }));
  ocean.frustumCulled = false;
  scene.add(ocean);

  const sandTextureCanvas = document.createElement('canvas');
  sandTextureCanvas.width = sandTextureCanvas.height = 256;
  const ctx = sandTextureCanvas.getContext('2d');
  const pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = 216 + random() * 35;
    pixels.data[i] = n; pixels.data[i + 1] = n - 7; pixels.data[i + 2] = n - 27; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const sandTexture = new THREE.CanvasTexture(sandTextureCanvas);
  sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.repeat.set(95, 60);
  sandTexture.colorSpace = THREE.SRGBColorSpace;
  const sandGeo = new THREE.PlaneGeometry(200, 140, 140, 100);
  sandGeo.rotateX(-Math.PI / 2); sandGeo.translate(0, 0, 45);
  const positions = sandGeo.attributes.position;
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, groundHeight(x, z));
    const damp = THREE.MathUtils.smoothstep(z, 1.5, 6);
    const color = new THREE.Color().lerpColors(new THREE.Color('#aeb499'), new THREE.Color('#fff1ce'), damp);
    colors.push(color.r, color.g, color.b);
  }
  sandGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandTexture, vertexColors: true, roughness: 0.98 }));
  sand.receiveShadow = true;
  scene.add(sand);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#806b49', roughness: 0.96 });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const coconutsMat = new THREE.MeshStandardMaterial({ color: '#635c30', roughness: 0.9 });
  const crowns = [];
  function palm(x, z, height, lean, rotation) {
    const root = new THREE.Group();
    root.position.set(x, groundHeight(x, z), z); root.rotation.y = rotation;
    const points = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18; points.push(new THREE.Vector3(lean * t * t, height * t, Math.sin(t * Math.PI) * 0.25)); }
    const curve = new THREE.CatmullRomCurve3(points);
    const trunkGeometry = new THREE.TubeGeometry(curve, 24, 0.17, 8, false);
    const pos = trunkGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / 9), t = ring / 24, center = curve.getPointAt(t);
      const taper = 1.35 - t * 0.65;
      pos.setXYZ(i, center.x + (pos.getX(i) - center.x) * taper, center.y + (pos.getY(i) - center.y) * taper, center.z + (pos.getZ(i) - center.z) * taper);
    }
    trunkGeometry.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeometry, trunkMat); trunk.castShadow = true; trunk.receiveShadow = true;
    root.add(trunk);
    // Rings catch the light like a real coconut palm's leaf scars.
    const rings = [];
    for (let i = 1; i < 23; i++) {
      const t = i / 24, ring = new THREE.TorusGeometry(0.17 * (1.35 - t * 0.65), 0.009, 3, 8);
      ring.rotateX(Math.PI / 2); const center = curve.getPointAt(t); ring.translate(center.x, center.y, center.z); rings.push(ring);
    }
    root.add(new THREE.Mesh(mergeGeometries(rings), trunkMat));
    const crown = new THREE.Group(); crown.position.set(lean, height, 0);
    const leaves = [];
    for (let f = 0; f < 10; f++) {
      const angle = f / 10 * Math.PI * 2 + random() * 0.3;
      const length = 3.0 + random() * 1.45;
      const verts = [];
      const centerAt = t => new THREE.Vector3(Math.cos(angle) * length * t, Math.sin(t * Math.PI) * 0.8 - t * t * (1.3 + (f % 3) * 0.3), Math.sin(angle) * length * t);
      for (let j = 1; j < 30; j++) {
        const t = j / 31, center = centerAt(t), next = centerAt(t + 0.023);
        const width = Math.sin(t * Math.PI) * 0.68;
        for (const side of [-1, 1]) {
          const tip = center.clone().add(new THREE.Vector3(-Math.sin(angle) * width * side + Math.cos(angle) * 0.32, -0.13 - width * 0.26, Math.cos(angle) * width * side + Math.sin(angle) * 0.32));
          verts.push(...center.toArray(), ...tip.toArray(), ...next.toArray());
        }
      }
      const frondColor = new THREE.Color().lerpColors(new THREE.Color('#40632b'), new THREE.Color('#789841'), random());
      function tint(geometry) {
        const color = [];
        for (let i = 0; i < geometry.attributes.position.count; i++) color.push(frondColor.r, frondColor.g, frondColor.b);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geometry.computeVertexNormals(); tint(geometry); leaves.push(geometry);
      const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 10 }, (_, j) => centerAt(j / 9))), 9, 0.022, 3, false);
      const stemTriangles = stem.toNonIndexed();
      stemTriangles.deleteAttribute('uv');
      tint(stemTriangles);
      leaves.push(stemTriangles); stem.dispose();
    }
    const fronds = new THREE.Mesh(mergeGeometries(leaves), leafMat);
    fronds.castShadow = true; fronds.receiveShadow = true; crown.add(fronds);
    for (let c = 0; c < 4; c++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), coconutsMat);
      nut.position.set(Math.cos(c * 1.7) * 0.25, -0.16, Math.sin(c * 1.7) * 0.25); nut.scale.y = 1.2; crown.add(nut);
    }
    root.add(crown); scene.add(root); crowns.push({ crown, phase: random() * 6.28 });
  }
  [[-3.8,4.2,5.8,1.0,0.3],[-10,8,7,1.5,0.3],[-15,13,8,1.3,1.1],[-21,17,7.5,1,0.6],[5.2,5,6.1,-1.3,-0.3],[13,10,7,-1.6,-0.3],[19,17,8,-1.2,0.7],[25,21,7,0.5,2],[-7,23,6.8,1.5,1],[8,29,8,1.3,2.5],[-28,8,6,1,0]].forEach(p => palm(...p));

  const rockMat = new THREE.MeshStandardMaterial({ color: '#84968b', roughness: 1 });
  const greenMat = new THREE.MeshStandardMaterial({ color: '#3c683c', roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const island = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), rockMat);
    island.position.set(-75 + i * 14, -1.2, -95 - i * 5); island.scale.set(18, 6 + i * 2.5, 11); scene.add(island);
    const vegetation = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), greenMat);
    vegetation.position.copy(island.position).add(new THREE.Vector3(0, 2, 0)); vegetation.scale.set(16, 5 + i * 2.2, 10); scene.add(vegetation);
  }
  // Low shrubs at the back of the beach keep the walking area open.
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), greenMat, 70);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 70; i++) {
    const x = (random() - 0.5) * 130, z = 33 + random() * 23;
    dummy.position.set(x, groundHeight(x, z) + 0.7, z); dummy.scale.set(1 + random() * 2, 0.8 + random(), 1 + random()); dummy.rotation.y = random() * 6.28; dummy.updateMatrix(); bushes.setMatrixAt(i, dummy.matrix);
  }
  bushes.castShadow = true; scene.add(bushes);
  const shells = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshStandardMaterial({ color: '#eee4cc', roughness: 1 }), 100);
  for (let i = 0; i < 100; i++) {
    const x = (random() - 0.5) * 55, z = 4 + random() * 19;
    dummy.position.set(x, groundHeight(x, z) + 0.025, z); dummy.scale.set(1, 0.45, 0.7); dummy.rotation.y = random() * 6.28; dummy.updateMatrix(); shells.setMatrixAt(i, dummy.matrix);
  }
  scene.add(shells);

  const woodMat = new THREE.MeshStandardMaterial({ color: '#a68a59', roughness: 0.92 });
  const fabricMat = new THREE.MeshStandardMaterial({ color: '#e9e0c4', roughness: 1, side: THREE.DoubleSide });
  function beam(a, b, radius, material, group) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, va.distanceTo(vb), 6), material);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize()); mesh.castShadow = true; group.add(mesh);
  }
  const retreat = new THREE.Group(); retreat.position.set(16, groundHeight(16, 24), 24); retreat.rotation.y = -0.5;
  for (const x of [-1.8, 1.8]) for (const z of [-1.6, 1.6]) beam([x,0,z],[x,3,z],0.085,woodMat,retreat);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 4), new THREE.MeshStandardMaterial({ color: '#8c7948', roughness: 1 }));
  roof.position.y = 3.6; roof.rotation.y = Math.PI / 4; roof.castShadow = true; retreat.add(roof);
  for (const x of [-0.85, 0.85]) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 1.8), fabricMat); chair.position.set(x, 0.4, 0); chair.rotation.x = -0.12; chair.castShadow = true; retreat.add(chair);
    beam([x-0.27,0,-0.5],[x-0.27,0.4,0.5],0.045,woodMat,retreat); beam([x+0.27,0,-0.5],[x+0.27,0.4,0.5],0.045,woodMat,retreat);
  }
  scene.add(retreat);
  const boat = new THREE.Group(); boat.position.set(14, 0.12, -10); boat.rotation.y = 0.75;
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), woodMat); hull.scale.set(0.42, 0.45, 2.2); boat.add(hull);
  beam([-0.9,0,-1],[-0.9,0,1.5],0.07,woodMat,boat); beam([-0.9,0.05,-0.6],[0.1,0.05,-0.6],0.025,woodMat,boat); beam([-0.9,0.05,0.7],[0.1,0.05,0.7],0.025,woodMat,boat); scene.add(boat);

  const birds = [];
  const birdMat = new THREE.MeshBasicMaterial({ color: '#3d565c', side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute([-0.5,0,0, 0,0,0.12, 0,0,-0.1, 0,0,0.12, 0.5,0,0, 0,0,-0.1],3));
    const bird = new THREE.Mesh(geometry,birdMat); scene.add(bird); birds.push(bird);
  }
  const dayTop = new THREE.Color('#2388c1'), dayHorizon = new THREE.Color('#93c8d1');
  const sunsetTop = new THREE.Color('#566d9b'), sunsetHorizon = new THREE.Color('#f9ba84');
  const nightTop = new THREE.Color('#061321'), nightHorizon = new THREE.Color('#2b4059');
  scene.fog = new THREE.FogExp2(uniforms.skyHorizon.value, 0.003);
  function setHour(hour) {
    const light = daylight(hour), warm = Math.max(0, 1 - Math.abs(light - 0.48) * 2.1);
    uniforms.day.value = light;
    uniforms.skyTop.value.copy(nightTop).lerp(dayTop, light).lerp(sunsetTop, warm * 0.6);
    uniforms.skyHorizon.value.copy(nightHorizon).lerp(dayHorizon, light).lerp(sunsetHorizon, warm * 0.85);
    const angle = (hour - 6) / 24 * Math.PI * 2;
    uniforms.sunDirection.value.set(-Math.cos(angle) * 0.7, Math.max(0.04, Math.sin(angle)), -0.6).normalize();
    sun.position.copy(uniforms.sunDirection.value).multiplyScalar(55).add(sun.target.position);
    sun.intensity = 3.0 * light; sun.color.set(warm > 0.3 ? '#ffd3a0' : '#fff2d9');
    hemisphere.intensity = 0.22 + light * 1.7;
    hemisphere.color.set(light < 0.3 ? '#8fabdf' : '#d8f4ff');
    scene.fog.color.copy(uniforms.skyHorizon.value);
    renderer.toneMappingExposure = 1.02 + (1 - light) * 0.15;
  }
  let ratio = 1;
  function resize(pixelRatio = ratio) {
    ratio = pixelRatio;
    renderer.setPixelRatio(pixelRatio); renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }
  function render(time) {
    uniforms.time.value = time;
    dome.position.copy(camera.position);
    for (const { crown, phase } of crowns) { crown.rotation.z = Math.sin(time * 0.55 + phase) * 0.025; crown.rotation.x = Math.cos(time * 0.4 + phase) * 0.018; }
    boat.position.y = 0.12 + Math.sin(time * 0.8) * 0.055; boat.rotation.z = Math.sin(time * 0.65) * 0.035;
    birds.forEach((bird, i) => {
      const t = time * 0.035 + i * 0.06;
      bird.position.set(Math.cos(t) * 38, 14 + Math.sin(t * 2 + i) * 2, -55 + Math.sin(t) * 20 + i * 2);
      bird.rotation.y = -t;
      const pos = bird.geometry.attributes.position; const flap = Math.sin(time * 3.2 + i) * 0.21;
      pos.setY(0, flap); pos.setY(4, flap); pos.needsUpdate = true;
    });
    renderer.render(scene, camera);
  }
  setHour(14);
  return { camera, renderer, resize, render, setHour };
}

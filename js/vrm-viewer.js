// Three.js + @pixiv/three-vrm によるキャラクター表示。
// VRMファイルが読み込まれていない間は、簡易プレースホルダー(発光する球体+目)を
// 表示し、「見た目がまだ無くても動作は確認できる」状態にしておく。

let THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils;
let modulesPromise = null;

async function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("@pixiv/three-vrm"),
    ]).then(([threeMod, gltfMod, vrmMod]) => {
      THREE = threeMod;
      GLTFLoader = gltfMod.GLTFLoader;
      VRMLoaderPlugin = vrmMod.VRMLoaderPlugin;
      VRMUtils = vrmMod.VRMUtils;
    });
  }
  return modulesPromise;
}

export class VrmViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.vrm = null;
    this.placeholder = null;
    this.clock = null;
    this.blinkTimer = 0;
    this.nextBlinkAt = 2 + Math.random() * 3;
    this.blinkStartTime = null;
    this.blinkDurationMs = 140;
    this.mouthTarget = 0;
    this.mouthCurrent = 0;
    this._boneBaseRotations = null;
    this._ready = false;
    this._raf = null;
  }

  async init() {
    await loadModules();

    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.35, 1.6);
    this.camera.lookAt(0, 1.3, 0);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(1, 2, 1.5);
    this.scene.add(keyLight);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x30303a, 0.9);
    this.scene.add(ambient);

    this._addPlaceholder();
    this.clock = new THREE.Clock();
    this._ready = true;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._tick();
  }

  _resize() {
    const canvas = this.canvas;
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    // 第3引数はupdateStyle。trueにしてcanvasのCSS表示サイズ(style.width/height)を
    // 明示的に固定する。falseのままだと、height:100%が親要素の高さ不定により解決できず、
    // canvasの実解像度(devicePixelRatio倍)が逆に親の高さ計算に影響する循環参照が起き、
    // リサイズのたびにキャラクター表示が縦に伸び続ける不具合が発生する。
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  _addPlaceholder() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.7, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c2440, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.26, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf1d9c8, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.45;
    group.add(head);

    // オッドアイ(左目:青、右目:赤)
    const eyeGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const leftEye = new THREE.Mesh(eyeGeo, new THREE.MeshStandardMaterial({ color: 0x4aa3ff, emissive: 0x1c4a7a }));
    leftEye.position.set(-0.09, 1.47, 0.22);
    const rightEye = new THREE.Mesh(eyeGeo, new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x7a1c1c }));
    rightEye.position.set(0.09, 1.47, 0.22);
    group.add(leftEye, rightEye);
    this.placeholderEyes = [leftEye, rightEye];
    this._eyeBaseScale = leftEye.scale.clone();

    // 口(発話時に開閉させる)
    const mouthGeo = new THREE.BoxGeometry(0.09, 0.02, 0.02);
    const mouth = new THREE.Mesh(mouthGeo, new THREE.MeshStandardMaterial({ color: 0x7a3b3b }));
    mouth.position.set(0, 1.36, 0.24);
    group.add(mouth);
    this.placeholderMouth = mouth;

    // 髪(紫・ツインテール風の簡易表現)
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x6a3fb0, roughness: 0.5 });
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.29, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairTop.position.y = 1.5;
    group.add(hairTop);
    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 12), hairMat);
      tail.position.set(0.28 * side, 1.15, -0.05);
      tail.rotation.z = side * 0.35;
      group.add(tail);
    }

    // 黒いリボン
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0x111114 });
    for (const side of [-1, 1]) {
      const ribbon = new THREE.Mesh(new THREE.TorusKnotGeometry(0.035, 0.012, 32, 4, 2, 3), ribbonMat);
      ribbon.position.set(0.24 * side, 1.32, 0.02);
      group.add(ribbon);
    }

    this.placeholder = group;
    this.scene.add(group);
  }

  _removePlaceholder() {
    if (this.placeholder) {
      this.scene.remove(this.placeholder);
      this.placeholder = null;
    }
  }

  /**
   * VRMファイル(Blob/ArrayBuffer)を読み込んで表示する。
   * @param {ArrayBuffer} arrayBuffer
   */
  async loadVrm(arrayBuffer) {
    await loadModules();
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.parseAsync(arrayBuffer, "");
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      throw new Error("VRMデータが見つかりませんでした(.vrmファイルではない可能性があります)");
    }

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
    this._removePlaceholder();

    VRMUtils.rotateVRM0(vrm);
    this.scene.add(vrm.scene);
    this.vrm = vrm;

    // カメラをキャラクターの頭部あたりに合わせる
    const headNode = vrm.humanoid?.getNormalizedBoneNode("head");
    const headY = headNode ? headNode.getWorldPosition(new THREE.Vector3()).y : 1.4;
    this.camera.position.set(0, headY - 0.05, 1.5);
    this.camera.lookAt(0, headY - 0.1, 0);

    // カメラ(=画面を見ているユーザー側)へ視線・顔がゆるやかに追従するようにする
    if (vrm.lookAt) {
      vrm.lookAt.target = this.camera;
    }

    this._captureBoneBaseRotations(vrm);
  }

  /**
   * VRMは読み込み直後、正規化ボーン(getNormalizedBoneNode)上では
   * 回転ゼロ、つまり「Tポーズ」(両腕を真横に伸ばした状態)になっている。
   * これはthree-vrm/VRM仕様上の既定の挙動であり、多くのビューアで見慣れている
   * 「腕を下ろした自然な状態」は、アプリ側が明示的に腕のボーンを回転させて
   * 作っているもの。ここでその「休め」姿勢を作り、待機モーションで動かす
   * 各ボーンの基準角度として控えておく(以後はこの基準角度に揺れを足すだけで、
   * 上書きはしない)。
   */
  _captureBoneBaseRotations(vrm) {
    this._boneBaseRotations = {};
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const deg = (d) => (d * Math.PI) / 180;

    // Tポーズから腕を下ろす(上腕を70度、前腕をさらに10度、体側へ回転させる)
    // ※符号は実機確認の結果、上に上がる向きだったため反転させている
    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    if (leftUpperArm) leftUpperArm.rotation.z = deg(-70);
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    if (rightUpperArm) rightUpperArm.rotation.z = deg(70);
    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    if (leftLowerArm) leftLowerArm.rotation.z = deg(-10);
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    if (rightLowerArm) rightLowerArm.rotation.z = deg(10);

    // hips/spine/neckはTポーズのままでも見た目に違和感がないため触らない
    const boneNames = [
      "hips",
      "spine",
      "neck",
      "leftUpperArm",
      "rightUpperArm",
      "leftLowerArm",
      "rightLowerArm",
    ];
    for (const name of boneNames) {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) this._boneBaseRotations[name] = node.rotation.clone();
    }
  }

  async unloadVrm() {
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
    this._boneBaseRotations = null;
    if (!this.placeholder) this._addPlaceholder();
  }

  /** 発話中の音量(0-1程度)を渡して口パクさせる */
  setMouthLevel(level) {
    this.mouthTarget = Math.max(0, Math.min(1, level));
  }

  /**
   * 腰・肩・腕に、呼吸に合わせた微妙な重心の揺れと、発話中のゆるい身振り手振りを
   * 加える。VRMのhumanoidボーンを直接動かすため、モデルが人型ボーン構成
   * (hips/spine/upperArmなど)を持っていない場合は何もしない。
   * ここでは毎フレーム「絶対値」で角度を代入している(前回値に加算しない)ので、
   * 値が際限なく大きくなっていく心配はない。
   */
  _animateIdleBody(vrm, nowMs) {
    const humanoid = vrm.humanoid;
    const base = this._boneBaseRotations;
    if (!humanoid || !base) return;
    const t = nowMs / 1000;

    // 単一周期のsin波だけだと機械的な繰り返しに見えるため、周期の異なる波を
    // 複数重ねて「呼吸のような大きなゆらぎ」+「不規則な微動」を作る。
    // 発話中かどうかに関わらず、常時この揺れが続く(声に反応する動きではない)。
    const breathe = Math.sin(t * 0.6) * 0.7 + Math.sin(t * 0.23 + 1.1) * 0.3;
    const micro = Math.sin(t * 1.7 + 2.0) * 0.4 + Math.sin(t * 2.9 + 0.4) * 0.3;

    const hips = humanoid.getNormalizedBoneNode("hips");
    if (hips && base.hips) hips.rotation.z = base.hips.z + breathe * 0.025;

    const spine = humanoid.getNormalizedBoneNode("spine");
    if (spine && base.spine) spine.rotation.z = base.spine.z - breathe * 0.02 + micro * 0.005;

    const neck = humanoid.getNormalizedBoneNode("neck");
    if (neck && base.neck) {
      neck.rotation.z = base.neck.z + micro * 0.015;
      neck.rotation.x = base.neck.x + Math.sin(t * 0.35 + 0.8) * 0.015;
    }

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    if (leftUpperArm && base.leftUpperArm) {
      leftUpperArm.rotation.z = base.leftUpperArm.z + breathe * 0.02 + micro * 0.015;
    }
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    if (rightUpperArm && base.rightUpperArm) {
      rightUpperArm.rotation.z = base.rightUpperArm.z - breathe * 0.02 - micro * 0.015;
    }

    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    if (leftLowerArm && base.leftLowerArm) {
      leftLowerArm.rotation.x = base.leftLowerArm.x + micro * 0.03;
    }
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    if (rightLowerArm && base.rightLowerArm) {
      rightLowerArm.rotation.x = base.rightLowerArm.x + micro * 0.03;
    }
  }

  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    const delta = this.clock.getDelta();
    const nowMs = performance.now();

    // 口パクをなめらかに追従させる
    this.mouthCurrent += (this.mouthTarget - this.mouthCurrent) * Math.min(1, delta * 12);

    // まばたき(VRM・プレースホルダー共通のタイマー)。一定のランダムな間隔で
    // blinkStartTimeをセットし、そこから経過時間で開閉の三角波を作る。
    this.blinkTimer += delta;
    if (this.blinkTimer >= this.nextBlinkAt) {
      this.blinkTimer = 0;
      this.nextBlinkAt = 2.5 + Math.random() * 3;
      this.blinkStartTime = nowMs;
    }
    let blinkValue = 0;
    if (this.blinkStartTime !== null) {
      const t = (nowMs - this.blinkStartTime) / this.blinkDurationMs;
      if (t >= 1) {
        this.blinkStartTime = null;
      } else {
        blinkValue = t < 0.5 ? t * 2 : (1 - t) * 2;
      }
    }

    // 呼吸のような、ごく微妙な左右の揺れ
    const sway = Math.sin(nowMs / 3000);

    if (this.vrm) {
      const em = this.vrm.expressionManager;
      if (em) {
        try {
          em.setValue("aa", this.mouthCurrent);
          em.setValue("blink", blinkValue);
        } catch {
          /* この表情キーを持たないモデルの場合は無視 */
        }
      }
      this.vrm.scene.rotation.y = sway * 0.05;
      this._animateIdleBody(this.vrm, nowMs);
      this.vrm.update(delta); // lookAt(視線追従)・springBoneなどもここで更新される
    } else if (this.placeholder) {
      this.placeholder.rotation.y = sway * 0.15;
      if (this.placeholderMouth) {
        this.placeholderMouth.scale.y = 1 + this.mouthCurrent * 6;
      }
      if (this.placeholderEyes) {
        const closed = Math.max(0.05, 1 - blinkValue);
        for (const eye of this.placeholderEyes) eye.scale.y = closed * this._eyeBaseScale.y;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", () => this._resize());
    this.renderer?.dispose();
  }
}

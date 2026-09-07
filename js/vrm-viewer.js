// Three.js + @pixiv/three-vrm によるキャラクター表示。
// VRMファイルが読み込まれていない間は、簡易プレースホルダー(発光する球体+目)を
// 表示し、「見た目がまだ無くても動作は確認できる」状態にしておく。

let THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils, OrbitControls;
let VRMAnimationLoaderPlugin, createVRMAnimationClip; // [検証用] VRMA最小再生テスト
let modulesPromise = null;

/**
 * 正規分布(ガウス分布)に従う乱数を1つ返す(Box-Muller変換)。
 * 単純なsin波による周期運動だけだと「毎回同じ動きの繰り返し」に見えて
 * しまうため、頭の細かい動きにはこちらを使い、時々ランダムな目標角度を
 * サンプリングしてゆっくり追従させることで、人間の間の悪さ・不規則さに
 * 近い動きを作る。
 */
function randomNormal(mean = 0, stdDev = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/controls/OrbitControls.js"),
      import("@pixiv/three-vrm"),
      import("@pixiv/three-vrm-animation"), // [検証用] VRMA最小再生テスト
    ]).then(([threeMod, gltfMod, controlsMod, vrmMod, vrmAnimMod]) => {
      THREE = threeMod;
      GLTFLoader = gltfMod.GLTFLoader;
      OrbitControls = controlsMod.OrbitControls;
      VRMLoaderPlugin = vrmMod.VRMLoaderPlugin;
      VRMUtils = vrmMod.VRMUtils;
      VRMAnimationLoaderPlugin = vrmAnimMod.VRMAnimationLoaderPlugin;
      createVRMAnimationClip = vrmAnimMod.createVRMAnimationClip;
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
    this._hipsBasePosition = null;
    this._danceStartTime = null;
    this._danceDurationMs = 8000;
    // 会話中の短いワンショット・ジェスチャーの状態
    this._gestureName = null;
    this._gestureStartTime = null;
    this._gestureDurationMs = 0;
    // 頭のランダムな微動(正規分布ノイズ)の状態
    this._headTargetX = 0;
    this._headTargetY = 0;
    this._headCurrentX = 0;
    this._headCurrentY = 0;
    this._headResampleAt = 0;
    // [検証用] VRMA最小再生テストの状態。既存のexpress()/playGesture()系とは
    // 独立させており、まだ本格統合(think_pose等への置き換え)はしていない。
    this.mixer = null;
    this._testVrmaPlaying = false;
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

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(1, 2, 1.5);
    this.scene.add(keyLight);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x30303a, 0.9);
    this.scene.add(ambient);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = Math.PI * 0.05; // 真上からの覗き込みを制限
    this.controls.maxPolarAngle = Math.PI * 0.85; // 真下からの覗き込みを制限

    this._addPlaceholder();
    this._frameCharacter(1.6, 0.9); // プレースホルダー用の暫定フレーミング(全身が入る距離)
    this.clock = new THREE.Clock();
    this._ready = true;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._tick();
  }

  /**
   * カメラの注視点(lookAtY、だいたい腰の高さ)と、全身がちょうど収まる距離を
   * 計算してセットする。以後はOrbitControlsでドラッグして周回・ホイールで
   * ズームイン/アウトできる。
   * @param {number} headTopY 頭のてっぺんのおおよその高さ(m)
   * @param {number} lookAtY  注視点の高さ(m。腰の高さを想定)
   */
  _frameCharacter(headTopY, lookAtY) {
    const margin = 0.15;
    const visibleHeight = headTopY + margin;
    const halfFovRad = ((this.camera.fov || 30) / 2) * (Math.PI / 180);
    const fullBodyDistance = visibleHeight / (2 * Math.tan(halfFovRad));

    this.camera.position.set(0, lookAtY, fullBodyDistance);
    this.controls.target.set(0, lookAtY, 0);
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = fullBodyDistance * 2.2;
    this.controls.update();
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

    // 全身が入る距離にカメラを合わせる(ホイールでズームイン/アウト可能)
    const headNode = vrm.humanoid?.getNormalizedBoneNode("head");
    const hipsNode = vrm.humanoid?.getNormalizedBoneNode("hips");
    const headY = headNode ? headNode.getWorldPosition(new THREE.Vector3()).y : 1.4;
    const hipsY = hipsNode ? hipsNode.getWorldPosition(new THREE.Vector3()).y : 0.9;
    this._frameCharacter(headY + 0.2, hipsY);

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
    const setZ = (name, degrees) => {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) node.rotation.z = deg(degrees);
    };

    // Tポーズから腕を下ろす(上腕を70度、前腕をさらに10度、体側へ回転させる)
    // ※符号は実機確認の結果、上に上がる向きだったため反転させている
    setZ("leftUpperArm", -70);
    setZ("rightUpperArm", 70);
    setZ("leftLowerArm", -10);
    setZ("rightLowerArm", 10);

    // 指をまっすぐ伸ばしたままだと不自然なので、軽く曲げて自然な手の形にする
    // (これは実機未確認のため、曲がる向きが逆の場合は符号を反転させる想定)
    for (const side of ["left", "right"]) {
      const sign = side === "left" ? -1 : 1;
      setZ(`${side}ThumbProximal`, sign * 10);
      setZ(`${side}ThumbDistal`, sign * 10);
      for (const finger of ["Index", "Middle", "Ring", "Little"]) {
        setZ(`${side}${finger}Proximal`, sign * 16);
        setZ(`${side}${finger}Intermediate`, sign * 14);
        setZ(`${side}${finger}Distal`, sign * 10);
      }
    }

    // 待機モーションで動かすボーンの基準角度(=上で作った「休め」姿勢)を保存する。
    // hips/spine/neckはTポーズのままでも見た目に違和感がないため角度は変えず、
    // 基準角度(0)だけ記録する。
    const boneNames = [
      "hips",
      "spine",
      "neck",
      "head",
      "leftUpperArm",
      "rightUpperArm",
      "leftLowerArm",
      "rightLowerArm",
    ];
    for (const name of boneNames) {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) this._boneBaseRotations[name] = node.rotation.clone();
    }

    // 指も同様に基準角度を保存し、待機モーションでごく小さく動かせるようにする
    this._fingerBoneNames = [];
    for (const side of ["left", "right"]) {
      this._fingerBoneNames.push(`${side}ThumbProximal`, `${side}ThumbDistal`);
      for (const finger of ["Index", "Middle", "Ring", "Little"]) {
        this._fingerBoneNames.push(`${side}${finger}Proximal`, `${side}${finger}Intermediate`, `${side}${finger}Distal`);
      }
    }
    for (const name of this._fingerBoneNames) {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) this._boneBaseRotations[name] = node.rotation.clone();
    }

    // ダンス中の上下バウンスの基準として、腰の元の高さを控えておく
    const hipsNode = humanoid.getNormalizedBoneNode("hips");
    this._hipsBasePosition = hipsNode ? hipsNode.position.clone() : null;
  }

  /**
   * 指定したスタイルの動きを、指定した時間(ミリ秒、既定8秒)だけ再生する。
   * @param {"wave"|"shadowbox"|"ballet"} style
   */
  startDance(style = "wave", durationMs = 8000) {
    this._danceStyle = style;
    this._danceStartTime = performance.now();
    this._danceDurationMs = durationMs;
  }

  get isDancing() {
    return this._danceStartTime !== null && performance.now() - this._danceStartTime < this._danceDurationMs;
  }

  /**
   * 会話中に呼び出す短いワンショット・ジェスチャーを再生する。
   * ダンス中は無視する(既存の振り付けと衝突しないように)。
   * @param {"nod"|"tilt_head"|"explain_hands"|"point"|"shrug"|"think_pose"|"cover_mouth"|"cross_arms"} name
   */
  playGesture(name, durationMs) {
    const defaultDurations = {
      nod: 1400,
      tilt_head: 1800,
      explain_hands: 2200,
      point: 1600,
      shrug: 1600,
      think_pose: 2600,
      cover_mouth: 1600,
      cross_arms: 2400,
    };
    if (!name || name === "none" || !(name in defaultDurations)) {
      console.warn(`[playGesture] 未知のジェスチャー名のため無視: "${name}"`);
      return;
    }
    if (this.isDancing) {
      console.warn(`[playGesture] ダンス中のため無視: "${name}"`);
      return;
    }
    if (!this.vrm) {
      console.warn(`[playGesture] VRM未読み込みのため無視: "${name}"`);
      return;
    }
    console.log(`[playGesture] 再生開始: "${name}" (${durationMs || defaultDurations[name]}ms)`);
    this._gestureName = name;
    this._gestureStartTime = performance.now();
    this._gestureDurationMs = durationMs || defaultDurations[name];
  }

  get isGesturing() {
    return (
      this._gestureName !== null && performance.now() - this._gestureStartTime < this._gestureDurationMs
    );
  }

  /**
   * [検証用] VRMAファイルを1つ読み込み、THREE.AnimationMixerで最小限に再生する。
   * 目的は「VRMA → VRM → AnimationMixerで実際に動く」というパイプラインの
   * 疎通確認のみで、既存のexpress()/playGesture()(nod/think_pose等)や
   * ダンス・待機モーションとはまだ統合していない。再生中は待機モーションの
   * 揺れ(_animateIdleBody)だけを一時的に止め、動きが分かりやすいようにする。
   * @param {string} url 例: "assets/motions/test.vrma"
   */
  async playTestVrma(url) {
    await loadModules();
    if (!this.vrm) {
      throw new Error("VRMが読み込まれていません(先にVRMファイルを読み込んでください)");
    }

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    let gltfVrma;
    try {
      gltfVrma = await loader.loadAsync(url);
    } catch (err) {
      console.error(`[playTestVrma] VRMAファイルの読み込みに失敗しました: ${url}`, err);
      throw new Error(`VRMAファイルが見つからないか読み込めません: ${url}`);
    }

    const vrmAnimation = gltfVrma.userData.vrmAnimations?.[0];
    if (!vrmAnimation) {
      throw new Error(`VRMAファイルにアニメーションが含まれていません: ${url}`);
    }

    const clip = createVRMAnimationClip(vrmAnimation, this.vrm);

    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    }
    this.mixer.stopAllAction();

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    this._testVrmaPlaying = true;
    const onFinished = () => {
      this._testVrmaPlaying = false;
      this.mixer.removeEventListener("finished", onFinished);
    };
    this.mixer.addEventListener("finished", onFinished);

    console.log(`[playTestVrma] 再生開始: ${url} (${clip.duration.toFixed(2)}秒)`, clip);
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
  _animateIdleBody(vrm, nowMs, delta) {
    if (this._testVrmaPlaying) return; // [検証用] VRMA再生中は待機モーションを止める

    const humanoid = vrm.humanoid;
    const base = this._boneBaseRotations;
    if (!humanoid || !base) return;
    const t = nowMs / 1000;

    if (this.isDancing) {
      if (this._danceStyle === "shadowbox") {
        this._animateShadowbox(humanoid, base, t);
      } else if (this._danceStyle === "ballet") {
        this._animateBallet(humanoid, base, t);
      } else {
        this._animateDance(humanoid, base, t);
      }
      this._animateFingerWiggle(humanoid, base, t);
      return;
    }

    if (this.isGesturing) {
      this._animateGesture(humanoid, base, nowMs);
      this._animateFingerWiggle(humanoid, base, t);
      return;
    } else if (this._gestureName !== null) {
      this._gestureName = null; // 再生時間が終わったので待機モーションへ戻す
    }

    // 単一周期のsin波だけだと機械的な繰り返しに見えるため、周期の異なる波を
    // 複数重ねて「呼吸のような大きなゆらぎ」+「不規則な微動」を作る。
    // 発話中かどうかに関わらず、常時この揺れが続く(声に反応する動きではない)。
    const breathe = Math.sin(t * 0.6) * 0.7 + Math.sin(t * 0.23 + 1.1) * 0.3;
    const micro = Math.sin(t * 1.7 + 2.0) * 0.4 + Math.sin(t * 2.9 + 0.4) * 0.3;

    const hips = humanoid.getNormalizedBoneNode("hips");
    if (hips && base.hips) hips.rotation.z = base.hips.z + breathe * 0.04;

    const spine = humanoid.getNormalizedBoneNode("spine");
    if (spine && base.spine) spine.rotation.z = base.spine.z - breathe * 0.035 + micro * 0.01;

    const neck = humanoid.getNormalizedBoneNode("neck");
    if (neck && base.neck) {
      neck.rotation.z = base.neck.z + micro * 0.02;
    }

    // 立っているときも完全な棒立ちにならないよう、体重の左右移動を常時加える。
    // ※前回、膝の曲げ伸ばし(動的なkneeBend)を大きくしたところ、足首側の
    // 補正(IK)がないため「脚が実質的に縮んで足が地面から浮いて見える」
    // 状態になってしまった。膝は動かさず一定のわずかな曲げのみに留め、
    // 体重移動は腰の左右位置(hips.position.x)だけで表現する。
    const weightShift = Math.sin(t * 0.9 + 0.6); // -1〜1、7秒程度の周期で左右の重心が入れ替わる
    const kneeBend = 0.035; // 常に一定のごくわずかな曲げ(動かさない)

    const leftLowerLeg = humanoid.getNormalizedBoneNode("leftLowerLeg");
    if (leftLowerLeg) leftLowerLeg.rotation.x = kneeBend;
    const rightLowerLeg = humanoid.getNormalizedBoneNode("rightLowerLeg");
    if (rightLowerLeg) rightLowerLeg.rotation.x = kneeBend;

    if (hips && this._hipsBasePosition) {
      hips.position.x = this._hipsBasePosition.x + weightShift * 0.02;
    }

    // 手首にも揺れを足す(これまで未使用だったボーン)
    const leftHand = humanoid.getNormalizedBoneNode("leftHand");
    if (leftHand) leftHand.rotation.z = Math.sin(t * 0.9 + 1.2) * 0.09;
    const rightHand = humanoid.getNormalizedBoneNode("rightHand");
    if (rightHand) rightHand.rotation.z = Math.sin(t * 0.9 + 2.4) * 0.09;

    // 頭の細かい動きの目標角度だけここで更新しておく(実際にボーンへ反映するのは
    // 視線追従(lookAt)と競合しないよう vrm.update() の後、_tick()側で行う)。
    this._updateHeadFidgetTarget(t, delta);

    // 話している間は、常時の揺れに加えてごくわずかな手の動きだけを上乗せする。
    // 以前はここで複数の速い周期のsin波を重ねて大きめに動かしていたが、
    // 「ぴくぴく」と不自然に見えるとの指摘を受けて大幅に控えめにした。
    // 今はAIのexpress()呼び出しによる、内容に応じたはっきりしたジェスチャー
    // (nod/explain_hands/think_poseなど、playGesture側)が主役になったため、
    // ここは「マイクに反応してわずかに動いている」程度で十分。
    const talk = this.mouthCurrent;
    const talkSway = Math.sin(t * 1.1) * 0.06 + Math.sin(t * 0.5 + 1.0) * 0.04;

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    if (leftUpperArm && base.leftUpperArm) {
      leftUpperArm.rotation.z = base.leftUpperArm.z + breathe * 0.09 + micro * 0.05 + talkSway * talk;
    }
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    if (rightUpperArm && base.rightUpperArm) {
      rightUpperArm.rotation.z = base.rightUpperArm.z - breathe * 0.09 - micro * 0.05 - talkSway * talk;
    }

    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    if (leftLowerArm && base.leftLowerArm) {
      leftLowerArm.rotation.x = base.leftLowerArm.x + micro * 0.08 + Math.sin(t * 0.8 + 0.4) * 0.08 * talk;
    }
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    if (rightLowerArm && base.rightLowerArm) {
      rightLowerArm.rotation.x = base.rightLowerArm.x + micro * 0.08 + Math.sin(t * 0.8 + 1.2) * 0.08 * talk;
    }

    this._animateFingerWiggle(humanoid, base, t);
  }

  /** 指にもごく小さな揺れを足して、完全に固まって見えないようにする */
  _animateFingerWiggle(humanoid, base, t) {
    if (!this._fingerBoneNames) return;
    const fingerWiggle = Math.sin(t * 1.3) * 0.03 + Math.sin(t * 2.1 + 1.0) * 0.02;
    for (const name of this._fingerBoneNames) {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node && base[name] !== undefined) {
        node.rotation.z = base[name].z + fingerWiggle;
      }
    }
  }

  /**
   * 頭を正規分布ノイズでランダムに、少しずつ動かす。
   * 一定間隔(約1.5〜3.5秒ごと)でランダムな目標角度を新しくサンプリングし、
   * そこへゆっくり(delta基準で)追従させることで、一定周期のsin波にはない
   * 「間」や不規則さを作る。x=縦(うなずき方向)、y=横(首振り方向)。
   */
  _updateHeadFidgetTarget(t, delta) {
    if (t >= this._headResampleAt) {
      const degToRad = Math.PI / 180;
      this._headTargetX = randomNormal(0, 2) * degToRad; // 標準偏差2度
      this._headTargetY = randomNormal(0, 3) * degToRad; // 標準偏差3度
      this._headResampleAt = t + 1.5 + Math.random() * 2;
    }
    const followSpeed = Math.min(1, delta * 1.5);
    this._headCurrentX += (this._headTargetX - this._headCurrentX) * followSpeed;
    this._headCurrentY += (this._headTargetY - this._headCurrentY) * followSpeed;
  }

  /**
   * 頭のランダムな微動を、視線追従(lookAt)が計算し終えたrawボーンに
   * 加算する。lookAtが頭のボーンを直接動かすタイプのVRMだと、
   * これをlookAtの計算前(vrm.update()前)に行っても上書きされてしまうため、
   * 必ずvrm.update()の後、rawボーン(getRawBoneNode)に対して加算する。
   */
  _applyHeadFidget(vrm) {
    if (this.isDancing) return; // ダンス中は各振り付け側の頭の動きを優先する
    const humanoid = vrm.humanoid;
    if (!humanoid) return;
    // ヘッドフィジェットの適用にはgetRawBoneNodeを直接操作するため、
    // ここではhumanoidの自動同期(autoUpdateHumanBones)を無効化しない
    // (他のボーンのnormalized→raw同期は通常通り機能させる)。
    const head = humanoid.getRawBoneNode("head");
    if (!head) return;
    head.rotation.x += this._headCurrentX;
    head.rotation.y += this._headCurrentY;
  }

  /**
   * ダンスモーション。一定のビートに合わせて、腰の左右の揺れ+上下バウンス、
   * 背骨の捻り、腕の振り上げ、首の縦揺れ、左右交互の足のステップ(足上げ+
   * 膝の屈伸)を組み合わせた簡易的な振り付け。
   * startDance()が呼ばれてから_danceDurationMsが経過するまで再生される。
   */
  _animateDance(humanoid, base, t) {
    const beat = t * 2.6;

    const hips = humanoid.getNormalizedBoneNode("hips");
    if (hips && base.hips) {
      hips.rotation.z = base.hips.z + Math.sin(beat) * 0.14;
      hips.rotation.y = Math.sin(beat * 0.5) * 0.18;
      if (this._hipsBasePosition) {
        hips.position.y = this._hipsBasePosition.y + Math.abs(Math.sin(beat * 2)) * 0.035;
      }
    }

    const spine = humanoid.getNormalizedBoneNode("spine");
    if (spine && base.spine) {
      spine.rotation.y = Math.sin(beat * 0.5 + 1.2) * 0.22;
      spine.rotation.z = base.spine.z + Math.sin(beat + 1) * 0.06;
    }

    const neck = humanoid.getNormalizedBoneNode("neck");
    if (neck && base.neck) {
      neck.rotation.x = base.neck.x + Math.sin(beat * 2) * 0.06;
      neck.rotation.z = base.neck.z + Math.sin(beat * 0.5) * 0.09;
    }

    // 腕を左右交互に振り上げる(0〜1に正規化したsin波で「休め」姿勢から持ち上げる)
    const raiseL = Math.sin(beat) * 0.5 + 0.5;
    const raiseR = Math.sin(beat + Math.PI) * 0.5 + 0.5;
    const upDeg = (Math.PI / 180) * 55;

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    if (leftUpperArm && base.leftUpperArm) {
      leftUpperArm.rotation.z = base.leftUpperArm.z + raiseL * upDeg;
    }
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    if (rightUpperArm && base.rightUpperArm) {
      rightUpperArm.rotation.z = base.rightUpperArm.z - raiseR * upDeg;
    }

    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    if (leftLowerArm && base.leftLowerArm) {
      leftLowerArm.rotation.x = base.leftLowerArm.x + Math.sin(beat * 1.5) * 0.35;
    }
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    if (rightLowerArm && base.rightLowerArm) {
      rightLowerArm.rotation.x = base.rightLowerArm.x + Math.sin(beat * 1.5 + Math.PI) * 0.35;
    }

    // 足を左右交互に持ち上げてステップを踏む(0は下ろした状態、1で持ち上げ+膝を曲げる)
    // ※脚の動きは未確認のため、変な向きに曲がる場合は符号を反転させる想定
    const stepL = Math.max(0, Math.sin(beat));
    const stepR = Math.max(0, Math.sin(beat + Math.PI));

    const leftUpperLeg = humanoid.getNormalizedBoneNode("leftUpperLeg");
    if (leftUpperLeg) leftUpperLeg.rotation.x = -stepL * 0.5; // 股関節を曲げて足を前に上げる
    const rightUpperLeg = humanoid.getNormalizedBoneNode("rightUpperLeg");
    if (rightUpperLeg) rightUpperLeg.rotation.x = -stepR * 0.5;

    const leftLowerLeg = humanoid.getNormalizedBoneNode("leftLowerLeg");
    if (leftLowerLeg) leftLowerLeg.rotation.x = stepL * 0.8; // 膝を曲げる(屈伸)
    const rightLowerLeg = humanoid.getNormalizedBoneNode("rightLowerLeg");
    if (rightLowerLeg) rightLowerLeg.rotation.x = stepR * 0.8;

    const leftFoot = humanoid.getNormalizedBoneNode("leftFoot");
    if (leftFoot) leftFoot.rotation.x = stepL * 0.3; // 足首を軽く補正
    const rightFoot = humanoid.getNormalizedBoneNode("rightFoot");
    if (rightFoot) rightFoot.rotation.x = stepR * 0.3;

    // 足を踏み出す側に、腰をほんの少し重心移動させる
    if (hips && this._hipsBasePosition) {
      hips.position.x = this._hipsBasePosition.x + (stepR - stepL) * 0.03;
    }
  }

  /**
   * シャドーボクシング風の動き。速いテンポで、腕を交互に伸ばして(肘を伸ばして
   * パンチを打つように)構え⇔突き出しを繰り返し、細かいフットワークと
   * ヘッドスリップ(頭の小さな揺れ)を組み合わせる。
   */
  _animateShadowbox(humanoid, base, t) {
    const beat = t * 4.2;

    const hips = humanoid.getNormalizedBoneNode("hips");
    if (hips) {
      if (this._hipsBasePosition) {
        hips.position.y = this._hipsBasePosition.y - 0.02 + Math.abs(Math.sin(beat)) * 0.02;
      }
      if (base.hips) hips.rotation.y = Math.sin(beat * 0.5) * 0.12;
    }

    const spine = humanoid.getNormalizedBoneNode("spine");
    if (spine && base.spine) spine.rotation.y = Math.sin(beat * 0.5 + Math.PI) * 0.1;

    const neck = humanoid.getNormalizedBoneNode("neck");
    if (neck && base.neck) {
      neck.rotation.z = base.neck.z + Math.sin(beat * 0.7) * 0.1; // ヘッドスリップ
      neck.rotation.x = base.neck.x + Math.sin(beat * 1.4) * 0.04;
    }

    // 交互にパンチ(構え=肘を曲げた状態 ⇔ 突き出し=肘を伸ばした状態)
    const punchL = Math.max(0, Math.sin(beat));
    const punchR = Math.max(0, Math.sin(beat + Math.PI));
    const guardDeg = (Math.PI / 180) * 35;
    const raiseDeg = (Math.PI / 180) * 40;

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    if (leftUpperArm && base.leftUpperArm) leftUpperArm.rotation.z = base.leftUpperArm.z + raiseDeg;
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    if (rightUpperArm && base.rightUpperArm) rightUpperArm.rotation.z = base.rightUpperArm.z - raiseDeg;

    // 肘: 構え(大きく曲げる)からパンチ(伸ばす)へ。0未満にはしない(逆関節防止)
    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    if (leftLowerArm && base.leftLowerArm) leftLowerArm.rotation.x = base.leftLowerArm.x + guardDeg * (1 - punchL);
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    if (rightLowerArm && base.rightLowerArm) rightLowerArm.rotation.x = base.rightLowerArm.x + guardDeg * (1 - punchR);

    // 細かいフットワーク
    const stepL = Math.max(0, Math.sin(beat * 0.5));
    const stepR = Math.max(0, Math.sin(beat * 0.5 + Math.PI));
    const leftUpperLeg = humanoid.getNormalizedBoneNode("leftUpperLeg");
    if (leftUpperLeg) leftUpperLeg.rotation.x = -stepL * 0.12;
    const rightUpperLeg = humanoid.getNormalizedBoneNode("rightUpperLeg");
    if (rightUpperLeg) rightUpperLeg.rotation.x = -stepR * 0.12;
    const leftLowerLeg = humanoid.getNormalizedBoneNode("leftLowerLeg");
    if (leftLowerLeg) leftLowerLeg.rotation.x = 0.15 + stepL * 0.15;
    const rightLowerLeg = humanoid.getNormalizedBoneNode("rightLowerLeg");
    if (rightLowerLeg) rightLowerLeg.rotation.x = 0.15 + stepR * 0.15;
  }

  /**
   * バレエ風の、ゆったりと大きな腕の動き(ポール・ド・ブラ風)と、
   * 片足をゆっくり持ち上げて静止する動き(アラベスク風)を組み合わせた
   * 優雅でゆっくりとしたモーション。
   */
  _animateBallet(humanoid, base, t) {
    const beat = t * 0.7; // ゆったりとしたテンポ

    const hips = humanoid.getNormalizedBoneNode("hips");
    if (hips && base.hips) hips.rotation.z = base.hips.z + Math.sin(beat) * 0.05;

    const spine = humanoid.getNormalizedBoneNode("spine");
    if (spine && base.spine) spine.rotation.y = Math.sin(beat * 0.6 + 0.5) * 0.18;

    const neck = humanoid.getNormalizedBoneNode("neck");
    if (neck && base.neck) {
      neck.rotation.z = base.neck.z + Math.sin(beat + 1) * 0.1;
      neck.rotation.x = base.neck.x - 0.03;
    }

    // 腕をゆっくり大きく、弧を描くように動かす(0〜1の滑らかな波)
    const armWave = Math.sin(beat) * 0.5 + 0.5;
    const upDeg = (Math.PI / 180) * 95;

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    if (leftUpperArm && base.leftUpperArm) leftUpperArm.rotation.z = base.leftUpperArm.z + armWave * upDeg;
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    if (rightUpperArm && base.rightUpperArm) {
      rightUpperArm.rotation.z = base.rightUpperArm.z - (1 - armWave) * upDeg;
    }
    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    if (leftLowerArm && base.leftLowerArm) leftLowerArm.rotation.x = base.leftLowerArm.x + 0.1;
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    if (rightLowerArm && base.rightLowerArm) rightLowerArm.rotation.x = base.rightLowerArm.x + 0.1;

    // 片足をゆっくり持ち上げて静止する(アラベスク風)。左右をゆっくり入れ替える
    const legPhase = Math.sin(beat * 0.5) * 0.5 + 0.5; // 0〜1、片方が上がっている間もう片方は下りている
    const leftUpperLeg = humanoid.getNormalizedBoneNode("leftUpperLeg");
    if (leftUpperLeg) leftUpperLeg.rotation.x = legPhase * 0.5;
    const rightUpperLeg = humanoid.getNormalizedBoneNode("rightUpperLeg");
    if (rightUpperLeg) rightUpperLeg.rotation.x = -(1 - legPhase) * 0.5;
    const leftLowerLeg = humanoid.getNormalizedBoneNode("leftLowerLeg");
    if (leftLowerLeg) leftLowerLeg.rotation.x = legPhase * 0.15;
    const rightLowerLeg = humanoid.getNormalizedBoneNode("rightLowerLeg");
    if (rightLowerLeg) rightLowerLeg.rotation.x = (1 - legPhase) * 0.15;
  }

  /**
   * 会話中の短いワンショット・ジェスチャー(nod/tilt_head/explain_hands/point/
   * shrug/think_pose/cover_mouth/cross_arms)を再生する。
   * ダンスと違って一度きりの動作なので、経過時間(elapsed)に対して
   * sin(π×progress)の弧(0→1→0)を「入り・抜けのなめらかさ」として掛け、
   * 動作の始まりと終わりが唐突にならないようにしている。
   * upperArmを前方(X軸)に回す動き(think_pose/cover_mouth/point/cross_arms)は
   * 実機未確認のため、逆向きに見える場合は符号を反転させる想定。
   */
  _animateGesture(humanoid, base, nowMs) {
    const elapsed = (nowMs - this._gestureStartTime) / 1000;
    const durationSec = this._gestureDurationMs / 1000;
    const progress = Math.min(1, elapsed / durationSec);
    // 「サッと上がってサッと戻る」だけだと一瞬すぎて見逃しやすいため、
    // 台形型のenvelopeにする: 最初の20%で立ち上がり、真ん中60%はポーズを
    // 保持(1.0のまま)、最後の20%で戻る。
    let envelope;
    if (progress < 0.2) {
      envelope = Math.sin((progress / 0.2) * (Math.PI / 2)); // 0→1
    } else if (progress < 0.8) {
      envelope = 1;
    } else {
      envelope = Math.sin(((1 - progress) / 0.2) * (Math.PI / 2)); // 1→0
    }

    const neck = humanoid.getNormalizedBoneNode("neck");
    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
    const leftShoulder = humanoid.getNormalizedBoneNode("leftShoulder");
    const rightShoulder = humanoid.getNormalizedBoneNode("rightShoulder");

    switch (this._gestureName) {
      case "nod": {
        if (neck && base.neck) {
          neck.rotation.x = base.neck.x + Math.sin(elapsed * Math.PI * 4) * 0.18 * envelope;
        }
        break;
      }
      case "tilt_head": {
        if (neck && base.neck) neck.rotation.z = base.neck.z + 0.22 * envelope;
        break;
      }
      case "think_pose": {
        // 右手を顎のあたりへ持っていくイメージ
        // ※前腕を曲げる向き(X軸の符号)が実機で効いていなかったため反転して再検証中
        if (rightUpperArm && base.rightUpperArm) rightUpperArm.rotation.z = base.rightUpperArm.z - 0.5 * envelope;
        if (rightLowerArm && base.rightLowerArm) rightLowerArm.rotation.x = base.rightLowerArm.x - 1.7 * envelope;
        if (neck && base.neck) neck.rotation.z = base.neck.z + 0.15 * envelope;
        break;
      }
      case "cover_mouth": {
        if (rightUpperArm && base.rightUpperArm) rightUpperArm.rotation.z = base.rightUpperArm.z - 0.55 * envelope;
        if (rightLowerArm && base.rightLowerArm) rightLowerArm.rotation.x = base.rightLowerArm.x - 2.0 * envelope;
        break;
      }
      case "explain_hands": {
        const wave = Math.sin(elapsed * Math.PI * 2.4);
        if (leftUpperArm && base.leftUpperArm) {
          leftUpperArm.rotation.z = base.leftUpperArm.z + (0.35 + wave * 0.15) * envelope;
        }
        if (rightUpperArm && base.rightUpperArm) {
          rightUpperArm.rotation.z = base.rightUpperArm.z - (0.35 - wave * 0.15) * envelope;
        }
        if (leftLowerArm && base.leftLowerArm) {
          leftLowerArm.rotation.x = base.leftLowerArm.x + (0.3 + wave * 0.2) * envelope;
        }
        if (rightLowerArm && base.rightLowerArm) {
          rightLowerArm.rotation.x = base.rightLowerArm.x + (0.3 - wave * 0.2) * envelope;
        }
        break;
      }
      case "point": {
        if (rightUpperArm && base.rightUpperArm) rightUpperArm.rotation.z = base.rightUpperArm.z - 0.9 * envelope;
        if (rightLowerArm && base.rightLowerArm) rightLowerArm.rotation.x = base.rightLowerArm.x + 0.1 * envelope;
        break;
      }
      case "shrug": {
        if (leftShoulder) leftShoulder.rotation.z = 0.3 * envelope;
        if (rightShoulder) rightShoulder.rotation.z = -0.3 * envelope;
        if (leftUpperArm && base.leftUpperArm) leftUpperArm.rotation.z = base.leftUpperArm.z + 0.15 * envelope;
        if (rightUpperArm && base.rightUpperArm) rightUpperArm.rotation.z = base.rightUpperArm.z - 0.15 * envelope;
        if (neck && base.neck) neck.rotation.x = base.neck.x + 0.08 * envelope;
        break;
      }
      case "cross_arms": {
        // 前腕を前方(未検証だったupperArmのX軸)に回す案は、実機で「腕を組む」
        // どころか「腕が横に広がる」結果になったため撤去。think_pose/cover_mouthと
        // 同じ、検証済みの軸(upperArm=Z軸で少し上げる、lowerArm=X軸で肘を
        // 大きく曲げる)だけで、両腕を体の前で折りたたむ形を作る。
        if (leftUpperArm && base.leftUpperArm) leftUpperArm.rotation.z = base.leftUpperArm.z + 0.45 * envelope;
        if (rightUpperArm && base.rightUpperArm) rightUpperArm.rotation.z = base.rightUpperArm.z - 0.45 * envelope;
        if (leftLowerArm && base.leftLowerArm) leftLowerArm.rotation.x = base.leftLowerArm.x - 1.9 * envelope;
        if (rightLowerArm && base.rightLowerArm) rightLowerArm.rotation.x = base.rightLowerArm.x - 1.9 * envelope;
        break;
      }
      default:
        break;
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
      this._animateIdleBody(this.vrm, nowMs, delta);
      this.mixer?.update(delta); // [検証用] VRMAのAnimationMixer(再生していない間は無害)
      this.vrm.update(delta); // lookAt(視線追従)・springBoneなどもここで更新される
      this._applyHeadFidget(this.vrm);
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

    this.controls?.update(); // enableDampingのために毎フレーム呼ぶ必要がある
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", () => this._resize());
    this.controls?.dispose();
    this.renderer?.dispose();
  }
}

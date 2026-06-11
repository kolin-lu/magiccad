import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import jscad from "@jscad/modeling";
import { isGeom3, isGeom2, isPath2 } from "./jscad-runner.js";

const { geom3, geom2, path2 } = jscad.geometries;

const DEFAULT_COLOR = 0x4f9dde;
const FILL_COLOR_2D = 0x4f9dde;
const LINE_COLOR_2D = 0x9fd4ff;

// 标准视图方向（轻微偏移避免与 up 向量共线导致 OrbitControls 退化）
const VIEW_DIRS = {
  iso: [1, -1, 0.8],
  top: [0.001, -0.001, 1],
  front: [0.001, -1, 0.001],
  right: [1, 0.001, 0.001],
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16191f);

    // CAD 习惯：Z 轴朝上。透视/正交双相机，按需切换
    this.perspCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
    this.perspCamera.up.set(0, 0, 1);
    this.perspCamera.position.set(90, -90, 70);

    this.orthoHalfH = 80; // 正交视体半高（世界单位）
    this.orthoCamera = new THREE.OrthographicCamera(-80, 80, 80, -80, 0.1, 100000);
    this.orthoCamera.up.set(0, 0, 1);
    this.orthoCamera.position.set(90, -90, 70);

    this.projection = "persp";
    this.camera = this.perspCamera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this._createControls();

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(120, -80, 200);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-100, 120, -60);
    this.scene.add(ambient, key, fill);

    this.gridVisible = true;
    this.axesVisible = true;
    this.wireframe = false;
    this.grid = null;
    this.axes = null;
    this.gridSpacing = 0;
    this._buildGrid(10); // 初始 10mm 格距 × 20 格 = 200mm，与旧版一致

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this._resize();
    new ResizeObserver(() => this._resize()).observe(container);

    const loop = () => {
      requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _createControls() {
    const target = this.controls?.target.clone();
    this.controls?.dispose();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    if (target) this.controls.target.copy(target);
  }

  _resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();
    this.orthoCamera.left = -this.orthoHalfH * aspect;
    this.orthoCamera.right = this.orthoHalfH * aspect;
    this.orthoCamera.top = this.orthoHalfH;
    this.orthoCamera.bottom = -this.orthoHalfH;
    this.orthoCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------- 网格 / 坐标轴 ----------

  /** 按格距重建网格（20×20 格）与坐标轴，使其与模型尺度匹配 */
  _buildGrid(spacing) {
    if (spacing === this.gridSpacing) return;
    this.gridSpacing = spacing;
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    if (this.axes) {
      this.scene.remove(this.axes);
      this.axes.geometry.dispose();
      this.axes.material.dispose();
    }
    const size = spacing * 20;
    this.grid = new THREE.GridHelper(size, 20, 0x3a4150, 0x262b35);
    this.grid.rotation.x = Math.PI / 2; // 放到 XY 平面
    this.grid.visible = this.gridVisible;
    this.scene.add(this.grid);

    this.axes = new THREE.AxesHelper(size * 0.15);
    this.axes.visible = this.axesVisible;
    this.scene.add(this.axes);
  }

  setGridVisible(visible) {
    this.gridVisible = visible;
    this.grid.visible = visible;
  }

  setAxesVisible(visible) {
    this.axesVisible = visible;
    this.axes.visible = visible;
  }

  // ---------- 显示模式 ----------

  setWireframe(on) {
    this.wireframe = on;
    this._applyWireframe();
  }

  _applyWireframe() {
    this.modelGroup.traverse((obj) => {
      if (obj.isMesh && obj.material?.isMeshStandardMaterial) {
        obj.material.wireframe = this.wireframe;
      }
    });
  }

  setProjection(mode) {
    if (mode === this.projection) return;
    const old = this.camera;
    const dist = old.position.distanceTo(this.controls.target);
    this.projection = mode;
    this.camera = mode === "ortho" ? this.orthoCamera : this.perspCamera;
    this.camera.position.copy(old.position);
    if (mode === "ortho") {
      // 让正交视野与当前透视画面大小一致
      this.orthoHalfH = dist * Math.tan((this.perspCamera.fov * Math.PI) / 360);
      this.orthoCamera.zoom = 1;
      this.orthoCamera.near = 0.1;
      this.orthoCamera.far = Math.max(dist * 20, 1000);
    }
    this._createControls();
    this._resize();
  }

  // ---------- 视图 ----------

  /** 切换标准视图：'iso' | 'top' | 'front' | 'right' */
  setStandardView(name) {
    const dir = VIEW_DIRS[name];
    if (dir) this.fitView(new THREE.Vector3(...dir));
  }

  /** 适应视图。不传 dir 时保持当前观察方向，只调整目标点与距离 */
  fitView(dirVec = null) {
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 10;
    const dist = size * 1.4;

    let dir = dirVec
      ? dirVec.clone().normalize()
      : this.camera.position.clone().sub(this.controls.target).normalize();
    if (!dir.lengthSq()) dir = new THREE.Vector3(...VIEW_DIRS.iso).normalize();

    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);

    if (this.projection === "ortho") {
      this.orthoHalfH = size * 0.55;
      this.orthoCamera.zoom = 1;
      this.orthoCamera.near = 0.1;
      this.orthoCamera.far = dist * 20;
      this._resize();
    } else {
      this.perspCamera.near = Math.max(size / 1000, 0.01);
      this.perspCamera.far = size * 100;
      this.perspCamera.updateProjectionMatrix();
    }
  }

  // ---------- 模型 ----------

  /** 设置几何体并自适应网格。返回 { size:[x,y,z], gridSpacing } */
  setGeometries(geometries) {
    this.modelGroup.clear();
    for (const g of geometries) {
      if (isGeom3(g)) this.modelGroup.add(buildMesh3D(g));
      else if (isGeom2(g)) this.modelGroup.add(buildShape2D(g));
      else if (isPath2(g)) this.modelGroup.add(buildPath(g));
    }
    return this._afterModelChange();
  }

  /** 打开外部 STL 文件（二进制或 ASCII），仅查看 */
  showSTL(arrayBuffer) {
    const geo = new STLLoader().parse(arrayBuffer);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x8fb87a,
        metalness: 0.1,
        roughness: 0.6,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    );
    this.modelGroup.clear();
    this.modelGroup.add(mesh);
    return this._afterModelChange();
  }

  _afterModelChange() {
    this._applyWireframe();
    const info = { size: [0, 0, 0], gridSpacing: this.gridSpacing };
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (!box.isEmpty()) {
      const s = box.getSize(new THREE.Vector3());
      info.size = [s.x, s.y, s.z];
      this._buildGrid(niceStep(Math.max(s.x, s.y, 1) / 10));
      info.gridSpacing = this.gridSpacing;
    }
    this.fitView();
    return info;
  }

  // ---------- 截图 ----------

  /** 截取当前画面为 data URL。width 指定时按比例缩小 */
  screenshot({ width = 0, type = "image/png", quality = 0.92 } = {}) {
    // 默认未开 preserveDrawingBuffer，必须先同步渲染一帧再取
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    if (!width || src.width <= width) return src.toDataURL(type, quality);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((src.height / src.width) * width);
    canvas.getContext("2d").drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(type, quality);
  }
}

/** 取不小于 raw 的 1/2/5×10^n 规整值，作为网格格距 */
function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

function toColor(geomColor, fallback) {
  if (Array.isArray(geomColor) && geomColor.length >= 3) {
    return new THREE.Color(geomColor[0], geomColor[1], geomColor[2]);
  }
  return new THREE.Color(fallback);
}

/** geom3 → 三角面片网格（多边形扇形剖分） */
function buildMesh3D(geometry) {
  const polygons = geom3.toPolygons(geometry);
  const positions = [];
  for (const poly of polygons) {
    const v = poly.vertices;
    for (let i = 2; i < v.length; i++) {
      positions.push(...v[0], ...v[i - 1], ...v[i]);
    }
  }
  const buf = new THREE.BufferGeometry();
  buf.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  buf.computeVertexNormals();

  const alpha = Array.isArray(geometry.color) ? geometry.color[3] ?? 1 : 1;
  const material = new THREE.MeshStandardMaterial({
    color: toColor(geometry.color, DEFAULT_COLOR),
    metalness: 0.1,
    roughness: 0.6,
    flatShading: true,
    transparent: alpha < 1,
    opacity: alpha,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(buf, material);
}

/** geom2 → 填充面 + 轮廓线（外轮廓逆时针、孔顺时针） */
function buildShape2D(geometry) {
  const group = new THREE.Group();
  const outlines = geom2.toOutlines(geometry);

  const outers = [];
  const holes = [];
  for (const outline of outlines) {
    (signedArea(outline) >= 0 ? outers : holes).push(outline);
  }

  const shapes = outers.map((pts) => ({
    shape: new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))),
    bbox: bbox2(pts),
  }));
  for (const hole of holes) {
    const [hx, hy] = hole[0];
    const owner =
      shapes.find(({ bbox: b }) => hx >= b[0] && hx <= b[2] && hy >= b[1] && hy <= b[3]) ||
      shapes[0];
    owner?.shape.holes.push(
      new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y)))
    );
  }

  const fillColor = toColor(geometry.color, FILL_COLOR_2D);
  for (const { shape } of shapes) {
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    group.add(mesh);
  }

  const lineMat = new THREE.LineBasicMaterial({ color: LINE_COLOR_2D });
  for (const outline of outlines) {
    const pts = outline.map(([x, y]) => new THREE.Vector3(x, y, 0));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }
  return group;
}

/** path2 → 折线 */
function buildPath(geometry) {
  const pts = path2.toPoints(geometry).map(([x, y]) => new THREE.Vector3(x, y, 0));
  const buf = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: toColor(geometry.color, LINE_COLOR_2D),
  });
  return geometry.isClosed ? new THREE.LineLoop(buf, mat) : new THREE.Line(buf, mat);
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function bbox2(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

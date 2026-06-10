import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import jscad from "@jscad/modeling";
import { isGeom3, isGeom2, isPath2 } from "./jscad-runner.js";

const { geom3, geom2, path2 } = jscad.geometries;

const DEFAULT_COLOR = 0x4f9dde;
const FILL_COLOR_2D = 0x4f9dde;
const LINE_COLOR_2D = 0x9fd4ff;

export class Viewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16191f);

    // CAD 习惯：Z 轴朝上
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(90, -90, 70);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(120, -80, 200);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-100, 120, -60);
    this.scene.add(ambient, key, fill);

    const grid = new THREE.GridHelper(200, 20, 0x3a4150, 0x262b35);
    grid.rotation.x = Math.PI / 2; // 放到 XY 平面
    this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(30));

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

  _resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setGeometries(geometries) {
    this.modelGroup.clear();
    for (const g of geometries) {
      if (isGeom3(g)) this.modelGroup.add(buildMesh3D(g));
      else if (isGeom2(g)) this.modelGroup.add(buildShape2D(g));
      else if (isPath2(g)) this.modelGroup.add(buildPath(g));
    }
    this.fitView();
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
    this.fitView();
  }

  fitView() {
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 10;
    const dist = size * 1.4;
    this.controls.target.copy(center);
    const dir = new THREE.Vector3(1, -1, 0.8).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(size / 1000, 0.01);
    this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();
  }
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

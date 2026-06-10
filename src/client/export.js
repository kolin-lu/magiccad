import stlSerializer from "@jscad/stl-serializer";
import svgSerializer from "@jscad/svg-serializer";
import dxfSerializer from "@jscad/dxf-serializer";
import { isGeom3, isGeom2, isPath2 } from "./jscad-runner.js";

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportSTL(geometries, name = "model") {
  const solids = geometries.filter(isGeom3);
  if (solids.length === 0) throw new Error("当前没有 3D 几何体可导出 STL");
  const data = stlSerializer.serialize({ binary: true }, ...solids);
  download(new Blob(data, { type: "model/stl" }), `${name}.stl`);
}

export function exportSVG(geometries, name = "drawing") {
  const flats = geometries.filter((g) => isGeom2(g) || isPath2(g));
  if (flats.length === 0) throw new Error("当前没有 2D 几何体可导出 SVG");
  const data = svgSerializer.serialize({ unit: "mm" }, ...flats);
  download(new Blob(data, { type: "image/svg+xml" }), `${name}.svg`);
}

export function exportDXF(geometries, name = "drawing") {
  const flats = geometries.filter((g) => isGeom2(g) || isPath2(g));
  if (flats.length === 0) throw new Error("当前没有 2D 几何体可导出 DXF");
  const data = dxfSerializer.serialize({}, ...flats);
  download(new Blob(data, { type: "application/dxf" }), `${name}.dxf`);
}

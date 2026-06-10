import jscad from "@jscad/modeling";

const { geom2, geom3, path2 } = jscad.geometries;

/**
 * 执行 AI 生成的 JSCAD 建模代码。
 * 代码中必须定义 main(params) 函数，全局注入 jscad 命名空间。
 * 返回 { geometries, kinds: {has3d, has2d} }
 */
export function runModelCode(code) {
  let main;
  try {
    const factory = new Function(
      "jscad",
      `"use strict";\n${code}\n;if (typeof main !== "function") throw new Error("代码中未定义 main 函数");\nreturn main;`
    );
    main = factory(jscad);
  } catch (err) {
    throw new Error(`代码解析失败：${err.message}`);
  }

  let result;
  try {
    result = main({});
  } catch (err) {
    throw new Error(`执行 main() 出错：${err.message}`);
  }

  const flat = flatten(result).filter((g) => g != null);
  const geometries = flat.filter(
    (g) => geom3.isA(g) || geom2.isA(g) || path2.isA(g)
  );
  if (geometries.length === 0) {
    throw new Error("main() 没有返回任何有效的几何体");
  }

  return {
    geometries,
    kinds: {
      has3d: geometries.some((g) => geom3.isA(g)),
      has2d: geometries.some((g) => geom2.isA(g) || path2.isA(g)),
    },
  };
}

export function isGeom3(g) {
  return geom3.isA(g);
}
export function isGeom2(g) {
  return geom2.isA(g);
}
export function isPath2(g) {
  return path2.isA(g);
}

function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  return [value];
}

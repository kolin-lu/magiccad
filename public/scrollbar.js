// 滚动条按需显示：滚动中给元素加 .scrolling 类（停止约 0.9s 后移除），
// 配合 style.css 中的滚动条样式实现「不滚动不显示」
(() => {
  const timers = new WeakMap();
  addEventListener(
    "scroll",
    (e) => {
      const target = e.target === document ? document.documentElement : e.target;
      if (!(target instanceof Element)) return;
      target.classList.add("scrolling");
      clearTimeout(timers.get(target));
      timers.set(target, setTimeout(() => target.classList.remove("scrolling"), 900));
    },
    { capture: true, passive: true }
  );
})();

/**
 * 基于 Cookie 的登录态：HttpOnly Cookie 存随机 token，token 对应 SQLite 中的 auth_sessions。
 */
const COOKIE_NAME = "magiccad_token";
const COOKIE_MAX_AGE = 30 * 86400; // 秒

export function createAuth(db) {
  function tokenOf(req) {
    const cookie = req.headers.cookie || "";
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
    }
    return null;
  }

  function setTokenCookie(res, token) {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
    );
  }

  function clearTokenCookie(res) {
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  /** 挂载 req.user（未登录为 null），不拦截 */
  function attachUser(req, _res, next) {
    req.authToken = tokenOf(req);
    req.user = db.authSessions.userOf(req.authToken);
    next();
  }

  function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "请先登录" });
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "请先登录" });
    if (req.user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
    next();
  }

  return { attachUser, requireAuth, requireAdmin, setTokenCookie, clearTokenCookie };
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    sharedAllowed: Boolean(u.shared_allowed) || u.role === "admin",
  };
}

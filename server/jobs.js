import crypto from "node:crypto";

const FINISHED_TTL_MS = 10 * 60 * 1000; // 已完成任务在内存中保留 10 分钟供断线客户端回放

/**
 * 后台生成任务管理（内存态）。
 * 任务独立于 HTTP 连接运行：客户端断开后任务继续，事件全量缓存，
 * 重新连接的客户端从头回放再续上实时流。最终结果由调用方落库到会话。
 */
export function createJobManager() {
  const jobs = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (job.status !== "running" && now - job.finishedAt > FINISHED_TTL_MS) {
        jobs.delete(id);
      }
    }
  }, 60_000).unref();

  return {
    create(userId, sessionId) {
      const job = {
        id: crypto.randomUUID(),
        userId,
        sessionId,
        status: "running", // 'running' | 'done'
        events: [], // 全量事件缓存，供回放
        listeners: new Set(),
        createdAt: Date.now(),
        finishedAt: 0,
      };
      jobs.set(job.id, job);
      return job;
    },

    get(id) {
      return jobs.get(id) || null;
    },

    /** 用户当前正在运行的任务（每用户同时只允许一个） */
    activeFor(userId) {
      for (const job of jobs.values()) {
        if (job.userId === userId && job.status === "running") return job;
      }
      return null;
    },

    push(job, event) {
      job.events.push(event);
      for (const fn of job.listeners) fn();
    },

    finish(job) {
      job.status = "done";
      job.finishedAt = Date.now();
      for (const fn of job.listeners) fn();
    },
  };
}

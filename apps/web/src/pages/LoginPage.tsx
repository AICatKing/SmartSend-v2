import { useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage } from "../lib/format";

export function LoginPage() {
  const { login, authError } = useAppContext();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setSubmitting(true);
    setMessage("");

    try {
      const payload: { email: string; name?: string; workspaceId?: string } = {
        email,
      };

      const trimmedName = name.trim();
      const trimmedWorkspaceId = workspaceId.trim();

      if (trimmedName) {
        payload.name = trimmedName;
      }

      if (trimmedWorkspaceId) {
        payload.workspaceId = trimmedWorkspaceId;
      }

      await login(payload);
      setMessage("登录成功，正在进入系统...");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>SmartSend 登录</h1>
        <p className="muted">使用真实会话上下文访问 workspace 内业务资源。</p>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          显示名称（首次登录可选）
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="你的名字"
          />
        </label>
        <label>
          目标工作区 ID（可选）
          <input
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            placeholder="留空则使用默认工作区"
          />
        </label>
        <div className="actions">
          <button disabled={submitting || !email.trim()} type="button" onClick={() => void submit()}>
            {submitting ? "登录中..." : "登录"}
          </button>
        </div>
        {message ? <p className="status-text">{message}</p> : null}
        {authError ? <p className="status-text">{authError}</p> : null}
      </section>
    </main>
  );
}

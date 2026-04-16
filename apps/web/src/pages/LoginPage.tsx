import { useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage } from "../lib/format";

export function LoginPage() {
  const { requestLoginCode, verifyLoginCode, authError } = useAppContext();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");

  async function sendCode() {
    setSendingCode(true);
    setMessage("");

    try {
      await requestLoginCode(email);
      setCodeSent(true);
      setMessage("验证码已发送，请检查邮箱。");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setSendingCode(false);
    }
  }

  async function submitCode() {
    setVerifyingCode(true);
    setMessage("");

    try {
      await verifyLoginCode({
        email,
        token,
      });
      setMessage("登录成功，正在进入系统...");
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setVerifyingCode(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>SmartSend 登录</h1>
        <p className="muted">使用 Supabase 邮箱验证码登录，再进入 workspace 内业务资源。</p>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {codeSent ? (
          <label>
            邮箱验证码
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="输入 6 位验证码"
            />
          </label>
        ) : null}
        <div className="actions">
          <button disabled={sendingCode || !email.trim()} type="button" onClick={() => void sendCode()}>
            {sendingCode ? "发送中..." : codeSent ? "重新发送验证码" : "发送验证码"}
          </button>
          {codeSent ? (
            <button
              disabled={verifyingCode || !email.trim() || !token.trim()}
              type="button"
              onClick={() => void submitCode()}
            >
              {verifyingCode ? "验证中..." : "验证并登录"}
            </button>
          ) : null}
        </div>
        {message ? <p className="status-text">{message}</p> : null}
        {authError ? <p className="status-text">{authError}</p> : null}
      </section>
    </main>
  );
}

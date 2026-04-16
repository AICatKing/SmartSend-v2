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
      setMessage("邮件已发送。已有账号会收到验证码；首次登录可能先收到确认邮箱邮件。");
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
        <p className="muted">
          使用 Supabase 邮箱登录。已有账号通常会收到验证码；首次登录可能需要先确认邮箱。
        </p>
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
            {sendingCode ? "发送中..." : codeSent ? "重新发送邮件" : "发送登录邮件"}
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
        <p className="muted">
          如果你收到的是 “Confirm your signup” 邮件，请先点邮件里的确认链接，再回到这里输入验证码或重新发送登录邮件。
        </p>
        {message ? <p className="status-text">{message}</p> : null}
        {authError ? <p className="status-text">{authError}</p> : null}
      </section>
    </main>
  );
}

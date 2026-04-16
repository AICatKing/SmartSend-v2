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
      setMessage("登录邮件已发送。请在邮箱中查找 6 位验证码并填入下方。");
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
      setMessage("验证成功，正在登录...");
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
          输入邮箱以接收 6 位验证码登录。
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
              placeholder="000000"
              maxLength={6}
            />
          </label>
        ) : null}
        <div className="actions">
          <button disabled={sendingCode || !email.trim()} type="button" onClick={() => void sendCode()}>
            {sendingCode ? "正在发送..." : codeSent ? "重新发送验证码" : "获取验证码"}
          </button>
          {codeSent ? (
            <button
              disabled={verifyingCode || !email.trim() || !token.trim()}
              type="button"
              onClick={() => void submitCode()}
            >
              {verifyingCode ? "正在验证..." : "登录"}
            </button>
          ) : null}
        </div>
        {codeSent && (
          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
            提示：如果你是首次使用此邮箱，可能会先收到一封 “Confirm your signup” 邮件，请点击其中的链接激活账号后再返回此处重新获取验证码。
          </p>
        )}
        {message ? <p className="status-text">{message}</p> : null}
        {authError ? <p className="status-text">{authError}</p> : null}
      </section>
    </main>
  );
}

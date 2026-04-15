import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="card">
      <h2>SmartSend v2 正式前端</h2>
      <p className="muted">
        当前后端阶段的最小产品闭环入口。
      </p>
      <ol>
        <li>
          在 <Link to="/workspace-config">发件配置</Link> 中配置发件能力
        </li>
        <li>
          在 <Link to="/contacts">联系人</Link> 中管理收件人
        </li>
        <li>
          在 <Link to="/templates">模板</Link> 中创建邮件模板
        </li>
        <li>
          在 <Link to="/campaigns">活动</Link> 中完成草稿创建、入队和进度查看
        </li>
      </ol>
    </section>
  );
}

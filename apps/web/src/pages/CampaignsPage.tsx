import { useEffect, useMemo, useState } from "react";

import { useAppContext } from "../lib/app-context";
import { asErrorMessage, formatDateTime } from "../lib/format";

export function CampaignsPage() {
  const { apiClient } = useAppContext();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof apiClient.listTemplates>>["items"]>([]);
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof apiClient.listCampaigns>>["items"]>([]);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof apiClient.getCampaignProgress>> | null>(null);
  const [sendJobs, setSendJobs] = useState<Awaited<ReturnType<typeof apiClient.listCampaignSendJobs>>["items"]>([]);
  const [recentFailures, setRecentFailures] = useState<Awaited<ReturnType<typeof apiClient.listCampaignRecentFailures>>["items"]>([]);
  const [draftName, setDraftName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [targetType, setTargetType] = useState<"all_contacts" | "group_name">("all_contacts");
  const [targetGroupName, setTargetGroupName] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [pollMs, setPollMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCampaign = useMemo(() => {
    return campaigns.find((item) => item.id === selectedCampaignId) ?? null;
  }, [campaigns, selectedCampaignId]);

  async function refreshDependencies() {
    const [templateOutput, campaignOutput] = await Promise.all([
      apiClient.listTemplates(),
      apiClient.listCampaigns(),
    ]);

    setTemplates(templateOutput.items);
    setCampaigns(campaignOutput.items);

    if (!templateId && templateOutput.items[0]) {
      setTemplateId(templateOutput.items[0].id);
    }

    if (!selectedCampaignId && campaignOutput.items[0]) {
      setSelectedCampaignId(campaignOutput.items[0].id);
    }
  }

  async function refreshCampaigns() {
    setLoading(true);
    setMessage("");
    try {
      await refreshDependencies();
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function createDraft() {
    setLoading(true);
    setMessage("");
    try {
      const target =
        targetType === "group_name"
          ? { type: "group_name" as const, groupName: targetGroupName }
          : { type: "all_contacts" as const };

      const output = await apiClient.createCampaignDraft({
        name: draftName,
        templateId,
        target,
      });

      setDraftName("");
      await refreshDependencies();
      setSelectedCampaignId(output.campaign.id);
      setMessage(`草稿已创建：${output.campaign.id}`);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function queueSelectedCampaign() {
    if (!selectedCampaignId) {
      setMessage("请先选择一个活动。");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const output = await apiClient.queueCampaign(selectedCampaignId, {
        maxAttempts,
      });

      await refreshDependencies();
      await Promise.all([
        loadProgress(output.campaignId),
        loadSendJobs(output.campaignId),
        loadRecentFailures(output.campaignId),
      ]);
      setMessage(`活动已入队，send_jobs=${output.queuedCount}`);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadProgress(campaignId: string = selectedCampaignId) {
    if (!campaignId) {
      return;
    }

    const output = await apiClient.getCampaignProgress(campaignId);
    setProgress(output);
  }

  async function loadSendJobs(campaignId: string = selectedCampaignId) {
    if (!campaignId) {
      return;
    }

    const output = await apiClient.listCampaignSendJobs(campaignId);
    setSendJobs(output.items);
  }

  async function loadRecentFailures(campaignId: string = selectedCampaignId) {
    if (!campaignId) {
      return;
    }

    const output = await apiClient.listCampaignRecentFailures(campaignId);
    setRecentFailures(output.items);
  }

  async function refreshSelectedCampaignDetails() {
    setLoading(true);
    setMessage("");
    try {
      await Promise.all([loadProgress(), loadSendJobs(), loadRecentFailures()]);
    } catch (error) {
      setMessage(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCampaigns();
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) {
      return;
    }

    void refreshSelectedCampaignDetails();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!pollMs || !selectedCampaignId) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshSelectedCampaignDetails();
    }, pollMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [pollMs, selectedCampaignId]);

  return (
    <section className="card">
      <h2>活动</h2>
      <p className="muted">创建草稿、执行入队，并跟踪发送进度与状态。</p>

      <div className="form-grid three-col">
        <label>
          草稿名称
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
        </label>
        <label>
          模板
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">请选择模板</option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          目标类型
          <select
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as "all_contacts" | "group_name")}
          >
            <option value="all_contacts">all_contacts（全部联系人）</option>
            <option value="group_name">group_name（按分组）</option>
          </select>
        </label>
        <label>
          目标分组名
          <input
            value={targetGroupName}
            disabled={targetType !== "group_name"}
            onChange={(event) => setTargetGroupName(event.target.value)}
          />
        </label>
      </div>
      <div className="actions">
        <button disabled={loading} type="button" onClick={() => void createDraft()}>
          创建草稿
        </button>
        <button disabled={loading} type="button" onClick={() => void refreshCampaigns()}>
          刷新活动列表
        </button>
      </div>

      <div className="form-grid three-col">
        <label>
          已选活动
          <select
            value={selectedCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
          >
            <option value="">请选择活动</option>
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} | {item.status} | {item.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          最大重试次数
          <input
            type="number"
            min={1}
            max={20}
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(Number(event.target.value))}
          />
        </label>
        <label>
          进度轮询
          <select value={pollMs} onChange={(event) => setPollMs(Number(event.target.value))}>
            <option value={0}>关闭</option>
            <option value={3000}>3s</option>
            <option value={5000}>5s</option>
          </select>
        </label>
      </div>
      <div className="actions">
        <button disabled={loading || !selectedCampaignId} type="button" onClick={() => void queueSelectedCampaign()}>
          入队活动
        </button>
        <button disabled={loading || !selectedCampaignId} type="button" onClick={() => void refreshSelectedCampaignDetails()}>
          刷新进度 / 任务 / 失败记录
        </button>
      </div>

      {message ? <p className="status-text">{message}</p> : null}

      {selectedCampaign ? (
        <div className="metrics-grid">
          <article>
            <span className="metric-label">活动状态</span>
            <strong>{selectedCampaign.status}</strong>
          </article>
          <article>
            <span className="metric-label">入队时间</span>
            <strong>{formatDateTime(selectedCampaign.queuedAt)}</strong>
          </article>
          <article>
            <span className="metric-label">目标</span>
            <strong>
              {selectedCampaign.target.type === "group_name"
                ? `group_name:${selectedCampaign.target.groupName}`
                : selectedCampaign.target.type}
            </strong>
          </article>
        </div>
      ) : null}

      {progress ? (
        <div className="metrics-grid">
          <article>
            <span className="metric-label">总数</span>
            <strong>{progress.total}</strong>
          </article>
          <article>
            <span className="metric-label">待处理</span>
            <strong>{progress.pending}</strong>
          </article>
          <article>
            <span className="metric-label">处理中</span>
            <strong>{progress.processing}</strong>
          </article>
          <article>
            <span className="metric-label">已发送</span>
            <strong>{progress.sent}</strong>
          </article>
          <article>
            <span className="metric-label">失败</span>
            <strong>{progress.failed}</strong>
          </article>
          <article>
            <span className="metric-label">已取消</span>
            <strong>{progress.cancelled}</strong>
          </article>
        </div>
      ) : null}

      <h3>活动列表</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>状态</th>
              <th>模板</th>
              <th>入队时间</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.status}</td>
                <td>{item.templateId}</td>
                <td>{formatDateTime(item.queuedAt)}</td>
              </tr>
            ))}
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  暂无活动。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h3>发送任务</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>收件人</th>
              <th>状态</th>
              <th>尝试次数</th>
              <th>计划时间</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            {sendJobs.map((item) => (
              <tr key={item.id}>
                <td>{item.recipientEmail}</td>
                <td>{item.status}</td>
                <td>
                  {item.attemptCount}/{item.maxAttempts}
                </td>
                <td>{formatDateTime(item.scheduledAt)}</td>
                <td>{item.lastErrorCode ?? "-"}</td>
              </tr>
            ))}
            {sendJobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  暂无发送任务。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h3>近期失败记录</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>收件人</th>
              <th>状态</th>
              <th>错误</th>
              <th>完成时间</th>
            </tr>
          </thead>
          <tbody>
            {recentFailures.map((item) => (
              <tr key={item.deliveryAttemptId}>
                <td>{item.recipientEmail}</td>
                <td>{item.sendJobStatus}</td>
                <td>{item.errorCode ?? "-"}</td>
                <td>{formatDateTime(item.completedAt)}</td>
              </tr>
            ))}
            {recentFailures.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  暂无失败记录。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

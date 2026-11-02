"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CarFront, CheckCheck, Inbox as InboxIcon, Loader2, Mail, Phone, RotateCcw, Search, Send, UserRound } from "lucide-react";
import { initials, vehicleTitle, type ConversationSummary, type Message, type WorkspaceData } from "@/lib/domain";
import { api, errorMessage } from "@/lib/client/api";
import { usePreferences } from "@/lib/client/preferences";
import { refreshWorkspace, useWorkspace } from "@/lib/client/workspace";

type Filter = "open" | "closed" | "all";
type Thread = { conversation: ConversationSummary; messages: Message[] };
const POLL_MS = 15_000;

export function Inbox() {
  const { data } = useWorkspace();
  if (!data) return null;
  return <InboxView data={data} />;
}

function useVisibleInterval(callback: () => void, ms: number) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") saved.current(); }, ms);
    return () => window.clearInterval(timer);
  }, [ms]);
}

function InboxView({ data }: { data: WorkspaceData }) {
  const { t, locale } = usePreferences();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [listError, setListError] = useState("");
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      setList(await api<ConversationSummary[]>(`/api/conversations${filter === "all" ? "" : `?status=${filter}`}`));
      setListError("");
    } catch (error) {
      setListError(errorMessage(error));
    }
  }, [filter]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    try {
      const next = await api<Thread>(`/api/conversations/${id}`);
      setThread((current) => {
        if (!quiet || current?.conversation.id !== id || current.messages.length !== next.messages.length) {
          requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
        }
        return next;
      });
      setThreadError("");
      if (!quiet) void refreshWorkspace();
    } catch (error) {
      setThreadError(errorMessage(error));
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    setNotice("");
    if (selectedId) void loadThread(selectedId);
    else setThread(null);
  }, [selectedId, loadThread]);
  useVisibleInterval(() => {
    void loadList();
    if (selectedId) void loadThread(selectedId, true);
  }, POLL_MS);

  const select = (id: string | null) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!thread || !reply.trim()) return;
    setSending(true);
    setNotice("");
    try {
      const message = await api<Message>(`/api/conversations/${thread.conversation.id}/messages`, { body: { body: reply.trim() } });
      setReply("");
      setThread({ ...thread, messages: [...thread.messages, message] });
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
      const email = message.delivery?.email;
      setNotice(email === "sent" ? "Reply sent and emailed to the customer." : email === "failed" ? "Reply saved, but the email could not be delivered. The customer can still read it from their conversation link." : "Reply saved. Email delivery isn't configured, so share the conversation link or contact the customer directly.");
      void loadList();
      void refreshWorkspace();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: "open" | "closed") {
    if (!thread) return;
    try {
      const conversation = await api<ConversationSummary>(`/api/conversations/${thread.conversation.id}`, { method: "PATCH", body: { status } });
      setThread({ ...thread, conversation });
      void loadList();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const term = search.trim().toLowerCase();
  const rows = (list ?? []).filter((c) => !term || `${c.customer.name} ${c.customer.email} ${c.subject} ${c.preview}`.toLowerCase().includes(term));
  const when = (iso: string) => {
    const date = new Date(iso);
    return date.toDateString() === new Date().toDateString()
      ? date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };
  const vehicle = thread?.conversation.vehicleId ? data.vehicles.find((v) => v.id === thread.conversation.vehicleId) : undefined;
  const lead = thread?.conversation.leadId ? data.leads.find((l) => l.id === thread.conversation.leadId) : undefined;

  return (
    <div className="portal-content">
      <div className="page-heading"><div><div className="eyebrow">{data.settings.dealership.toUpperCase()}</div><h1>{t("title.messages")}</h1><p>{t("sub.messages")}</p></div></div>
      <div className={`inbox ${selectedId ? "has-selection" : ""}`}>
        <section className="dealer-panel inbox-list">
          <div className="inbox-tabs">
            {(["open", "closed", "all"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{t(`inbox.${value}`)}</button>)}
          </div>
          <div className="record-search"><Search size={16} /><input aria-label="Search conversations" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {listError && <div className="form-error">{listError}</div>}
          {!list && !listError && <p className="muted-line"><Loader2 size={14} className="spin" /> {t("common.loading")}</p>}
          <ul>
            {rows.map((c) => (
              <li key={c.id}>
                <button className={`inbox-item ${c.id === selectedId ? "selected" : ""} ${c.unread ? "unread" : ""}`} onClick={() => select(c.id)}>
                  <span className="person-avatar">{initials(c.customer.name)}</span>
                  <span className="inbox-item-body">
                    <span className="inbox-item-top"><strong>{c.customer.name}</strong><small>{when(c.lastMessageAt)}</small></span>
                    <span className="inbox-subject">{c.subject}</span>
                    <small className="inbox-preview">{c.preview}</small>
                  </span>
                  {c.unread > 0 && <b className="unread-count">{c.unread}</b>}
                </button>
              </li>
            ))}
          </ul>
          {list && !rows.length && <div className="empty-state"><InboxIcon size={27} /><h3>{t("inbox.empty")}</h3><p>{t("inbox.emptyText")}</p></div>}
        </section>

        <section className="dealer-panel inbox-thread">
          {!selectedId && <div className="empty-state"><Mail size={27} /><h3>{t("inbox.select")}</h3><p>{t("inbox.replyNote")}</p></div>}
          {selectedId && threadError && <div className="form-error">{threadError}</div>}
          {selectedId && !thread && !threadError && <p className="muted-line"><Loader2 size={14} className="spin" /> {t("common.loading")}</p>}
          {thread && <>
            <header className="thread-header">
              <button className="icon-button thread-back" aria-label="Back to conversations" onClick={() => select(null)}><ArrowLeft size={18} /></button>
              <div>
                <h2>{thread.conversation.subject}</h2>
                <p className="thread-contact">
                  <span><UserRound size={13} />{thread.conversation.customer.name}</span>
                  <a href={`mailto:${thread.conversation.customer.email}`}><Mail size={13} />{thread.conversation.customer.email}</a>
                  {thread.conversation.customer.phone && <a href={`tel:${thread.conversation.customer.phone}`}><Phone size={13} />{thread.conversation.customer.phone}</a>}
                  {vehicle && <Link href={`/admin/inventory?q=${encodeURIComponent(vehicle.stock)}`}><CarFront size={13} />{vehicle.year} {vehicleTitle(vehicle)}</Link>}
                  {lead && <Link href={`/admin/leads?q=${encodeURIComponent(lead.email)}`}><span className={`status-badge ${lead.stage === "Won" ? "green" : "blue"}`}><i />Lead: {lead.stage}</span></Link>}
                </p>
              </div>
              {thread.conversation.status === "open"
                ? <button className="secondary-button" onClick={() => void setStatus("closed")}><CheckCheck size={15} />{t("inbox.close")}</button>
                : <button className="secondary-button" onClick={() => void setStatus("open")}><RotateCcw size={15} />{t("inbox.reopen")}</button>}
            </header>
            <div className="thread-messages">
              {thread.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.sender}`}>
                  <div className="bubble-meta"><strong>{m.authorName}</strong><small>{new Date(m.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</small></div>
                  <p>{m.body}</p>
                  {m.sender === "staff" && m.delivery && <small className="delivery">Email: {m.delivery.email ?? "skipped"}{m.delivery.sms && m.delivery.sms !== "skipped" ? ` · SMS: ${m.delivery.sms}` : ""}</small>}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form className="thread-reply" onSubmit={send}>
              <textarea aria-label={t("inbox.reply")} placeholder={t("inbox.reply")} rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(e); }} />
              <div className="thread-reply-actions">
                <small>{notice || t("inbox.replyNote")}</small>
                <button className="primary-button" disabled={sending || !reply.trim()}>{sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}{t("inbox.send")}</button>
              </div>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}

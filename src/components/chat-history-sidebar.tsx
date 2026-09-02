"use client";

import { Fish, MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";

export type ChatHistoryItem = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
};

type ChatHistorySidebarProps = {
  items: ChatHistoryItem[];
  activeChatId: string;
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
};

function updatedLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
  }

  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

export default function ChatHistorySidebar({
  items,
  activeChatId,
  collapsed,
  onToggle,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: ChatHistorySidebarProps) {
  return (
    <aside className={`chat-history-sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="Chat history">
      <button
        type="button"
        className="chat-sidebar-brand-control"
        onClick={onToggle}
        aria-label={collapsed ? "Expand chat history" : "Collapse chat history"}
        title={collapsed ? "Expand chat history" : "Collapse chat history"}
      >
        <span className="chat-sidebar-brand-mark" aria-hidden="true"><Fish size={19} strokeWidth={1.9} /></span>
        <span className="chat-sidebar-brand-copy"><strong>Orca<span>.ai</span></strong><small>Fishing desk</small></span>
        <span className="chat-sidebar-collapse-icon" aria-hidden="true">
          {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.8} /> : <PanelLeftClose size={17} strokeWidth={1.8} />}
        </span>
      </button>

      <button type="button" className="chat-new-button" onClick={onNewChat} title="New fishing chat">
        <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
        <span>New fishing chat</span>
      </button>

      <div className="chat-history-section-head">
        <span>Recent chats</span>
        <span className="chat-history-count">{items.length}</span>
      </div>

      <nav className="chat-history-list" aria-label="Recent fishing chats">
        {items.length ? items.map((item) => {
          const isActive = item.id === activeChatId;
          return (
            <div className={`chat-history-item${isActive ? " is-active" : ""}`} key={item.id}>
              <button
                type="button"
                className="chat-history-select"
                onClick={() => onSelectChat(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.title : undefined}
              >
                <span className="chat-history-item-icon" aria-hidden="true"><MessageSquareText size={15} strokeWidth={1.8} /></span>
                <span className="chat-history-item-copy">
                  <strong>{item.title}</strong>
                  <small>{item.preview || `${item.messageCount} message${item.messageCount === 1 ? "" : "s"}`}</small>
                </span>
                <time dateTime={item.updatedAt}>{updatedLabel(item.updatedAt)}</time>
              </button>
              <button type="button" className="chat-history-delete" onClick={() => onDeleteChat(item.id)} aria-label={`Delete ${item.title}`} title="Delete chat">
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          );
        }) : (
          <div className="chat-history-empty">
            <MessageSquareText size={18} strokeWidth={1.6} aria-hidden="true" />
            <span>Your fishing chats will appear here.</span>
          </div>
        )}
      </nav>

      <div className="chat-sidebar-footer">
        <span className="chat-sidebar-footer-dot" aria-hidden="true" />
        <span>Local fishing desk</span>
      </div>
    </aside>
  );
}

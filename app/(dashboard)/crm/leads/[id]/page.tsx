"use client";

import {
  ArrowLeft,
  BookmarkPlus,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Info,
  Mail,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  Phone,
  Reply,
  Save,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

/* ─── Mock Lead Data ────────────────────────────────────── */

interface LeadDetail {
  id: string;
  name: string;
  phone: string;
  location: string;
  statusTag: string;
  status: string;
  statusColor: string;
  uploadedBy: string;
  lastInteraction: string;
  source: string;
  assignTo: string;
  assignColor: string;
  nextAction: string;
  priority: string;
  priorityColor: string;
  created: string;
  avatar: string;
  time: string;
}

const MOCK_LEAD: LeadDetail = {
  id: "lead-1",
  name: "Lane Wade",
  phone: "+234 0000000000",
  location: "Ikeja GRA ...",
  statusTag: "Contacted",
  status: "Contacted",
  statusColor: "#E879A0",
  uploadedBy: "Collins Bill",
  lastInteraction: "Asked for Pricing",
  source: "Referral",
  assignTo: "Unassigned",
  assignColor: "#EF4444",
  nextAction: "Call Tomorrow",
  priority: "Medium",
  priorityColor: "#3B82F6",
  created: "Apr 23, 2026. 1:32pm",
  avatar: "/avatars/male-avatar.png",
  time: "2 days ago",
};

const STATUS_OPTIONS = [
  { label: "Contacted", color: "#E879A0" },
  { label: "New Lead", color: "#2563EB" },
  { label: "Proposal Sent", color: "#F59E0B" },
  { label: "Qualified", color: "#10B981" },
  { label: "Unqualified", color: "#1A1F2C" },
  { label: "Lost", color: "#EF4444" },
  { label: "Won", color: "#166534" },
];

const PRIORITY_OPTIONS = [
  { label: "Low", color: "#6B7280" },
  { label: "Medium", color: "#3B82F6" },
  { label: "High", color: "#F59E0B" },
  { label: "Urgent", color: "#EF4444" },
];

const ASSIGN_OPTIONS = [
  { label: "Unassigned", color: "#EF4444" },
  { label: "Collins Bill", color: "#10B981" },
  { label: "Lane Wade", color: "#3B82F6" },
  { label: "Francis N.", color: "#8B5CF6" },
];

/* ─── Email Data Model ──────────────────────────────────── */

interface EmailMessage {
  id: string;
  from: string;
  fromEmail: string;
  to: string;
  toEmail: string;
  subject: string;
  body: string;
  timestamp: string;
  timeAgo: string;
  isRead: boolean;
  isStarred: boolean;
  direction: "sent" | "received";
  attachments?: { name: string; size: string }[];
}

const INITIAL_EMAILS: EmailMessage[] = [
  {
    id: "email-1",
    from: "Lane Wade",
    fromEmail: "lane.wade@email.com",
    to: "You",
    toEmail: "admin@thefactory.com",
    subject: "Re: Partnership Proposal - Q3 2026",
    body: "Hi there,\n\nThank you for the proposal you sent over. I've reviewed the terms and I'm quite interested in exploring this further.\n\nI do have a few questions regarding the pricing structure and the onboarding timeline. Could we schedule a call this week to discuss?\n\nLooking forward to hearing from you.\n\nBest regards,\nLane Wade",
    timestamp: "Apr 24, 2026 • 9:15 AM",
    timeAgo: "1 hour ago",
    isRead: false,
    isStarred: true,
    direction: "received",
  },
  {
    id: "email-2",
    from: "You",
    fromEmail: "admin@thefactory.com",
    to: "Lane Wade",
    toEmail: "lane.wade@email.com",
    subject: "Partnership Proposal - Q3 2026",
    body: "Dear Lane,\n\nI hope this email finds you well. As discussed in our last meeting, I'd like to share our partnership proposal for Q3 2026.\n\nThe key highlights include:\n• Revenue sharing model at 70/30\n• Dedicated account manager\n• Priority support SLA (4-hour response time)\n• Co-branded marketing materials\n\nPlease review at your convenience and let me know your thoughts.\n\nWarm regards,\nThe Factory Team",
    timestamp: "Apr 23, 2026 • 2:30 PM",
    timeAgo: "Yesterday",
    isRead: true,
    isStarred: false,
    direction: "sent",
    attachments: [
      { name: "Proposal_Q3_2026.pdf", size: "2.4 MB" },
      { name: "Terms_and_Conditions.pdf", size: "890 KB" },
    ],
  },
  {
    id: "email-3",
    from: "Lane Wade",
    fromEmail: "lane.wade@email.com",
    to: "You",
    toEmail: "admin@thefactory.com",
    subject: "Pricing Inquiry",
    body: "Hello,\n\nI came across your services through a referral and I'm interested in learning more about your pricing plans.\n\nCould you please share some details about your enterprise tier? We're a team of about 50 people.\n\nThank you,\nLane",
    timestamp: "Apr 22, 2026 • 11:00 AM",
    timeAgo: "2 days ago",
    isRead: true,
    isStarred: false,
    direction: "received",
  },
  {
    id: "email-4",
    from: "You",
    fromEmail: "admin@thefactory.com",
    to: "Lane Wade",
    toEmail: "lane.wade@email.com",
    subject: "Welcome! Let's get you started",
    body: "Hi Lane,\n\nWelcome aboard! We're excited to have you consider The Factory for your team.\n\nI've attached a brief overview of our plans. Feel free to reach out if you have any questions.\n\nBest,\nCollins Bill\nAccount Manager",
    timestamp: "Apr 21, 2026 • 4:45 PM",
    timeAgo: "3 days ago",
    isRead: true,
    isStarred: true,
    direction: "sent",
    attachments: [{ name: "Plans_Overview.pdf", size: "1.2 MB" }],
  },
];

/* ─── Compose Email Panel ───────────────────────────────── */

function ComposeEmailPanel({
  leadName,
  leadEmail,
  onSend,
  onClose,
}: {
  leadName: string;
  leadEmail: string;
  onSend: (email: EmailMessage) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState(leadEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) return;
    setIsSending(true);
    setTimeout(() => {
      const newEmail: EmailMessage = {
        id: `email-${Date.now()}`,
        from: "You",
        fromEmail: "admin@thefactory.com",
        to: leadName,
        toEmail: to,
        subject,
        body,
        timestamp: new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        timeAgo: "Just now",
        isRead: true,
        isStarred: false,
        direction: "sent",
      };
      onSend(newEmail);
      setIsSending(false);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-300">
      {/* Compose header */}
      <div className="flex items-center justify-between px-1 pb-5 border-b border-gray-100">
        <h3 className="text-[15px] font-bold text-[#0B1215]">New Message</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-0 mt-4">
        <div className="flex items-center gap-3 py-3 border-b border-gray-50">
          <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider">
            To
          </label>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex items-center gap-2 bg-[#0B1215] text-white px-3 py-1.5 rounded-full text-[11px] font-semibold">
              {leadName}
              <X size={10} className="opacity-50 cursor-pointer hover:opacity-100" />
            </div>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Add recipient..."
              className="flex-1 outline-none text-[13px] text-[#0B1215] placeholder:text-gray-300 bg-transparent"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 py-3 border-b border-gray-50">
          <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider">
            Subj
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's this about?"
            className="flex-1 outline-none text-[14px] font-semibold text-[#0B1215] placeholder:text-gray-300 bg-transparent"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 mt-4 min-h-0">
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          className="w-full h-full min-h-[200px] resize-none outline-none text-[13px] text-[#374151] leading-relaxed placeholder:text-gray-300 bg-transparent"
        />
      </div>

      {/* Footer toolbar */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100">
            <Paperclip size={15} className="text-gray-400" />
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={!subject.trim() || !body.trim() || isSending}
          className={`flex items-center gap-2.5 px-7 py-3 rounded-[14px] text-[13px] font-bold transition-all shadow-md ${
            subject.trim() && body.trim() && !isSending
              ? "bg-[#0B1215] text-white hover:opacity-90"
              : "bg-gray-100 text-gray-300 cursor-not-allowed"
          }`}
        >
          {isSending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send size={15} />
              Send Email
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Email Thread Item ─────────────────────────────────── */

function EmailThreadItem({
  email,
  onClick,
  onStar,
}: {
  email: EmailMessage;
  onClick: () => void;
  onStar: () => void;
}) {
  const isSent = email.direction === "sent";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3.5 p-4 rounded-[18px] transition-all duration-200 text-left group relative ${
        !email.isRead
          ? "bg-blue-50/60 hover:bg-blue-50/90 border border-blue-100/50"
          : "hover:bg-gray-50 border border-transparent hover:border-gray-100"
      }`}
    >
      {/* Direction indicator */}
      <div className="shrink-0 mt-0.5">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
            isSent
              ? "bg-[#0B1215] text-white"
              : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white"
          }`}
        >
          {isSent ? (
            <Send size={15} className="rotate-[-30deg]" />
          ) : (
            <Mail size={16} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-[13px] truncate ${
                !email.isRead
                  ? "font-bold text-[#0B1215]"
                  : "font-semibold text-[#374151]"
              }`}
            >
              {isSent ? `To: ${email.to}` : email.from}
            </span>
            {isSent && (
              <CheckCheck size={13} className="text-[#10B981] shrink-0" />
            )}
          </div>
          <span className="text-[10px] text-gray-400 font-medium shrink-0 whitespace-nowrap">
            {email.timeAgo}
          </span>
        </div>

        <p
          className={`text-[12px] truncate mb-1 ${
            !email.isRead
              ? "font-semibold text-[#0B1215]"
              : "font-medium text-gray-600"
          }`}
        >
          {email.subject}
        </p>

        <p className="text-[11px] text-gray-400 truncate leading-relaxed">
          {email.body.split("\n")[0]}
        </p>

        {/* Attachments indicator */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <Paperclip size={11} className="text-gray-300" />
            <span className="text-[10px] text-gray-400 font-medium">
              {email.attachments.length} attachment
              {email.attachments.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Star + unread dot */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Star
            size={14}
            className={
              email.isStarred
                ? "fill-amber-400 text-amber-400 !opacity-100"
                : "text-gray-300"
            }
            style={{ opacity: email.isStarred ? 1 : undefined }}
          />
        </button>
        {!email.isRead && (
          <div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shadow-[0_0_6px_rgba(59,130,246,0.4)]" />
        )}
      </div>
    </button>
  );
}

/* ─── Email Detail View ─────────────────────────────────── */

function EmailDetailView({
  email,
  onBack,
  onReply,
  onDelete,
}: {
  email: EmailMessage;
  onBack: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const isSent = email.direction === "sent";

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[12px] font-semibold text-gray-500 hover:text-[#0B1215] transition-colors"
        >
          <ArrowLeft size={16} />
          Back to inbox
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onReply}
            className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
          >
            <Reply size={15} className="text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-red-50 transition-colors border border-gray-100 group"
          >
            <Trash2
              size={15}
              className="text-gray-400 group-hover:text-red-500 transition-colors"
            />
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="py-5 border-b border-gray-50">
        <h3 className="text-[17px] font-bold text-[#0B1215] leading-tight">
          {email.subject}
        </h3>
      </div>

      {/* Sender info */}
      <div className="flex items-center justify-between py-4 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
              isSent
                ? "bg-[#0B1215] text-white"
                : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white"
            }`}
          >
            {isSent ? (
              <Send size={14} className="rotate-[-30deg]" />
            ) : (
              <span className="text-[14px] font-bold">
                {email.from.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#0B1215]">
                {email.from}
              </span>
              {isSent && (
                <span className="text-[10px] font-semibold text-[#10B981] bg-emerald-50 px-2 py-0.5 rounded-full">
                  Sent
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-400">
              {isSent ? `To: ${email.toEmail}` : email.fromEmail}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400">
          <Clock size={12} />
          <span className="text-[11px] font-medium">{email.timestamp}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-6">
        <div className="text-[13px] text-[#374151] leading-[1.85] whitespace-pre-wrap">
          {email.body}
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Attachments ({email.attachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((att) => (
                <div
                  key={att.name}
                  className="flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 transition-colors rounded-xl px-4 py-2.5 border border-gray-100 cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <Paperclip size={14} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#0B1215] group-hover:text-[#3B82F6] transition-colors">
                      {att.name}
                    </p>
                    <p className="text-[10px] text-gray-400">{att.size}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick reply bar */}
      <div className="pt-4 border-t border-gray-100">
        <button
          onClick={onReply}
          className="w-full flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 rounded-[14px] border border-gray-100 transition-colors text-left group"
        >
          <Reply
            size={16}
            className="text-gray-400 group-hover:text-[#0B1215] transition-colors"
          />
          <span className="text-[13px] text-gray-400 group-hover:text-gray-500 transition-colors">
            Click to reply...
          </span>
        </button>
      </div>
    </div>
  );
}

/* ─── Email Communication Panel ─────────────────────────── */

function EmailCommunicationPanel({ leadName }: { leadName: string }) {
  const [emails, setEmails] = useState<EmailMessage[]>(INITIAL_EMAILS);
  const [view, setView] = useState<"list" | "compose" | "detail">("list");
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [replyTo, setReplyTo] = useState<EmailMessage | null>(null);

  const leadEmail = "lane.wade@email.com";
  const unreadCount = emails.filter((e) => !e.isRead).length;

  const handleSend = (newEmail: EmailMessage) => {
    setEmails((prev) => [newEmail, ...prev]);
    setView("list");
    setReplyTo(null);
  };

  const handleEmailClick = (email: EmailMessage) => {
    // Mark as read
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e))
    );
    setSelectedEmail({ ...email, isRead: true });
    setView("detail");
  };

  const handleStar = (id: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, isStarred: !e.isStarred } : e
      )
    );
  };

  const handleDelete = () => {
    if (!selectedEmail) return;
    setEmails((prev) => prev.filter((e) => e.id !== selectedEmail.id));
    setSelectedEmail(null);
    setView("list");
  };

  const handleReply = () => {
    if (selectedEmail) {
      setReplyTo(selectedEmail);
    }
    setView("compose");
  };

  return (
    <div className="flex-1 bg-white rounded-[32px] p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm relative">
            <Mail size={20} className="text-[#0B1215]" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#3B82F6] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
                {unreadCount}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-[18px] font-bold text-[#0B1215]">
              Email communication
            </h2>
            <p className="text-[11px] text-gray-400 font-medium">
              {emails.length} message{emails.length !== 1 ? "s" : ""} with{" "}
              {leadName}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setReplyTo(null);
            setView("compose");
          }}
          className="flex items-center gap-3 px-6 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-bold hover:opacity-90 transition-all shadow-md"
          id="compose-email-btn"
        >
          <Pencil size={16} />
          Compose Email
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {view === "compose" ? (
          <ComposeEmailPanel
            leadName={leadName}
            leadEmail={leadEmail}
            onSend={handleSend}
            onClose={() => {
              setView("list");
              setReplyTo(null);
            }}
          />
        ) : view === "detail" && selectedEmail ? (
          <EmailDetailView
            email={selectedEmail}
            onBack={() => {
              setSelectedEmail(null);
              setView("list");
            }}
            onReply={handleReply}
            onDelete={handleDelete}
          />
        ) : emails.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="mb-8 opacity-20 grayscale scale-125">
              <EmailEmptyIcon />
            </div>
            <p className="text-gray-400 text-[18px] text-center leading-relaxed max-w-[320px] font-normal italic">
              No emails yet. Send the first email to start a conversation
            </p>
          </div>
        ) : (
          /* Email list */
          <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
            {emails.map((email) => (
              <EmailThreadItem
                key={email.id}
                email={email}
                onClick={() => handleEmailClick(email)}
                onStar={() => handleStar(email.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Dropdown Component ────────────────────────────────── */


function PillDropdown({
  value,
  color,
  options,
  onChange,
  disabled,
}: {
  value: string;
  color: string;
  options: { label: string; color: string }[];
  onChange: (label: string, color: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-medium transition-opacity hover:opacity-85"
        style={{ backgroundColor: color }}
      >
        {value}
        {!disabled && <ChevronDown size={11} />}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[150px]">
            {options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  onChange(opt.label, opt.color);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color }}
                />
                <span className="text-[12px] text-[#0B1215] font-medium">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Email Empty State Icon ────────────────────────────── */

function EmailEmptyIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 28L40 44L60 28"
        stroke="#D1D5DB"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="14"
        y="22"
        width="52"
        height="36"
        rx="4"
        stroke="#D1D5DB"
        strokeWidth="3"
      />
      <path
        d="M32 52L24 60"
        stroke="#D1D5DB"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M48 52L56 60"
        stroke="#D1D5DB"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Map Preview Component ─────────────────────────────── */

function MapPreview({ name }: { name: string }) {
  return (
    <div className="relative w-full h-full bg-[#E8F0E8] rounded-[14px] overflow-hidden">
      {/* Fake map grid lines */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute w-full h-px bg-[#C5D5C5]"
            style={{ top: `${(i + 1) * 12}%` }}
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute h-full w-px bg-[#C5D5C5]"
            style={{ left: `${(i + 1) * 16}%` }}
          />
        ))}
      </div>

      {/* Diagonal "streets" */}
      <div className="absolute inset-0">
        <div
          className="absolute bg-white/60 h-0.5"
          style={{
            width: "140%",
            top: "40%",
            left: "-20%",
            transform: "rotate(-25deg)",
          }}
        />
        <div
          className="absolute bg-white/60 h-0.5"
          style={{
            width: "140%",
            top: "55%",
            left: "-20%",
            transform: "rotate(15deg)",
          }}
        />
        {/* Street label */}
        <div
          className="absolute text-[8px] text-[#6B8A6B] font-medium"
          style={{
            top: "20%",
            right: "15%",
            transform: "rotate(-30deg)",
          }}
        >
          Dresta Street
        </div>
      </div>

      {/* Location marker pin */}
      <div className="absolute" style={{ top: "22%", left: "38%" }}>
        <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-md" />
      </div>

      {/* Avatar + name tooltip */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/avatars/male-avatar.png"
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://i.pravatar.cc/150?u=lane-wade";
            }}
          />
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm">
          <p className="text-[9px] font-bold text-[#0B1215]">{name}</p>
          <p className="text-[7px] text-gray-500">
            14, Adeola Road, Ikeja GRA
          </p>
        </div>
      </div>

      {/* Compass / location icon */}
      <div className="absolute bottom-3 right-3 w-7 h-7 bg-[#D8B4FE] rounded-full flex items-center justify-center shadow-sm">
        <MapPin size={14} className="text-white" />
      </div>
    </div>
  );
}

/* ─── Page Component ────────────────────────────────────── */

export default function LeadDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [lead, setLead] = useState<LeadDetail>(MOCK_LEAD);

  const updateField = (field: keyof LeadDetail, value: string) => {
    setLead((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // In a real app, this would call an API
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-10">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl hover:bg-white/80 transition-all"
              id="lead-back-btn"
            >
              <ArrowLeft size={22} className="text-[#0B1215]" />
            </button>
            <h1 className="text-[22px] font-bold text-[#0B1215] tracking-tight">
              Lead Details
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <button
              className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white rounded-[14px] text-[13px] font-semibold text-[#64748B] hover:border-gray-300 transition-all shadow-sm"
              id="add-new-lead-btn"
            >
              <BookmarkPlus size={16} />
              Add New Lead
            </button>
            {isEditing ? (
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-7 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-black hover:opacity-90 transition-all shadow-lg"
                id="save-lead-btn"
              >
                <Save size={16} />
                Save
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-7 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-black hover:opacity-90 transition-all shadow-lg"
                id="edit-lead-btn"
              >
                <Pencil size={16} />
                Edit Lead
              </button>
            )}
          </div>
        </div>

        {/* ── Main Content Grid ───────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-8 items-stretch">
          {/* ── LEFT COLUMN ──────────────────────────────── */}
          <div className="flex-[1.2] flex flex-col gap-8">
            {/* ── Hero Card (dark) ───────────────────────── */}
            <div className="bg-[#0B1A1E] rounded-[32px] p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex gap-8">
              {/* Left Part: White Info Card */}
              <div className="flex flex-col items-center gap-4 shrink-0">
                <div className="bg-white rounded-[28px] p-4 shadow-xl flex flex-col items-center w-[180px]">
                  <div className="relative w-full aspect-square mb-4">
                    <div className="absolute inset-0 bg-black/20 rounded-[22px] blur-xl translate-y-4" />
                    <div className="relative w-full h-full rounded-[22px] overflow-hidden bg-[#FFC58E]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/avatars/male-avatar.png"
                        alt={lead.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://i.pravatar.cc/150?u=lane-wade";
                        }}
                      />
                    </div>
                  </div>
                  <h3 className="text-[#0B1215] text-[18px] font-bold text-center leading-none mb-1.5 tracking-tight">
                    {lead.name}
                  </h3>
                  <p className="text-gray-400 text-[12px] font-medium text-center mb-3">
                    {lead.time}
                  </p>
                  <span className="bg-[#0EA5E9] text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-tighter shadow-sm">
                    {lead.priority}
                  </span>
                </div>
                {/* Action icons */}
                <div className="flex items-center gap-4">
                  <button className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-all shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100">
                    <MessageSquare size={20} className="text-[#0B1215]" />
                  </button>
                  <button className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-all shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100">
                    <MapPin size={20} className="text-[#0B1215]" />
                  </button>
                </div>
              </div>

              {/* Right Part: Fields & Map */}
              <div className="flex-1 flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-semibold mb-1">
                      Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lead.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        className="bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-bold w-full outline-none focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-white text-[16px] font-bold">
                        {lead.name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-semibold mb-1">
                      Phone Number
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lead.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        className="bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-bold w-full outline-none focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-white text-[16px] font-bold">
                        {lead.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-semibold mb-1">
                      Location
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lead.location}
                        onChange={(e) => updateField("location", e.target.value)}
                        className="bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-bold w-full outline-none focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-white text-[16px] font-bold">
                        {lead.location}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-semibold mb-1">
                      Status Tag
                    </label>
                    <p className="text-white text-[16px] font-bold">
                      {lead.statusTag}
                    </p>
                  </div>
                </div>
                {/* Map */}
                <div className="flex-1 min-h-[160px] rounded-[24px] overflow-hidden shadow-inner">
                  <MapPreview name={lead.name} />
                </div>
              </div>
            </div>

            {/* ── Lead Details Card ──────────────────────── */}
            <div className="bg-white rounded-[32px] p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex-1">
              <div className="flex items-center gap-4 mb-8 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm">
                  <Info size={20} className="text-[#0B1215]" />
                </div>
                <h2 className="text-[18px] font-bold text-[#0B1215]">
                  Lead Details
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-x-12 gap-y-8">
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Status
                  </label>
                  <PillDropdown
                    value={lead.status}
                    color={lead.statusColor}
                    options={STATUS_OPTIONS}
                    onChange={(label, color) =>
                      setLead((p) => ({ ...p, status: label, statusColor: color }))
                    }
                    disabled={!isEditing}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Uploaded By
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={lead.uploadedBy}
                      onChange={(e) => updateField("uploadedBy", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-semibold w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-bold">
                      {lead.uploadedBy}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Last Interaction
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={lead.lastInteraction}
                      onChange={(e) => updateField("lastInteraction", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-semibold w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-bold">
                      {lead.lastInteraction}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Source
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={lead.source}
                      onChange={(e) => updateField("source", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-semibold w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-bold">
                      {lead.source}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Assign to
                  </label>
                  <PillDropdown
                    value={lead.assignTo}
                    color={lead.assignColor}
                    options={ASSIGN_OPTIONS}
                    onChange={(label, color) =>
                      setLead((p) => ({ ...p, assignTo: label, assignColor: color }))
                    }
                    disabled={!isEditing}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Next Action
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={lead.nextAction}
                      onChange={(e) => updateField("nextAction", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-semibold w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-bold">
                      {lead.nextAction}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Priority
                  </label>
                  <PillDropdown
                    value={lead.priority}
                    color={lead.priorityColor}
                    options={PRIORITY_OPTIONS}
                    onChange={(label, color) =>
                      setLead((p) => ({ ...p, priority: label, priorityColor: color }))
                    }
                    disabled={!isEditing}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-semibold uppercase tracking-widest">
                    Created
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={lead.created}
                      onChange={(e) => updateField("created", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-semibold w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-bold">
                      {lead.created}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Email Communication ─────── */}
          <EmailCommunicationPanel leadName={lead.name} />
        </div>
      </div>
    </div>
  );
}

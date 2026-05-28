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
  FileText,
  Activity,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState, useEffect, useMemo } from "react";
import { useLead, useUpdateLead, useAddLeadNote, useAddLeadActivity, useCrmLabels } from "@/hooks/use-crm";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  ApiLeadPriority,
  ApiLeadStatus,
  LeadApiItem,
  LeadNote,
  LeadActivity,
  UpdateLeadPayload,
} from "@/lib/api/crm";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";

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
  { label: "Contacted", color: "#E879A0", value: "contacted" },
  { label: "New Lead", color: "#2563EB", value: "newly_lead" },
  { label: "Proposal Sent", color: "#F59E0B", value: "proposal_sent" },
  { label: "Qualified", color: "#10B981", value: "qualified" },
  { label: "Unqualified", color: "#1A1F2C", value: "unqualified" },
  { label: "Lost", color: "#EF4444", value: "lost" },
  { label: "Won", color: "#166534", value: "won" },
];

const PRIORITY_OPTIONS = [
  { label: "Low", color: "#6B7280" },
  { label: "Medium", color: "#3B82F6" },
  { label: "High", color: "#F59E0B" },
  { label: "Urgent", color: "#EF4444" },
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
      <div className="flex items-center justify-between px-0 pb-4 border-b border-gray-100">
        <h3 className="text-[14px] sm:text-[15px] font-semibold text-[#0B1215]">New Message</h3>
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
            <div className="flex items-center gap-2 bg-[#0B1215] text-white px-3 py-1.5 rounded-full text-[11px] font-medium">
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
            className="flex-1 outline-none text-[14px] font-medium text-[#0B1215] placeholder:text-gray-300 bg-transparent"
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
          className={`w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-[12px] sm:rounded-[14px] text-[13px] font-semibold transition-all shadow-md ${subject.trim() && body.trim() && !isSending
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
    <div
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 sm:gap-3.5 p-3 sm:p-4 rounded-[16px] sm:rounded-[18px] transition-all duration-200 text-left group relative cursor-pointer ${!email.isRead
          ? "bg-blue-50/60 hover:bg-blue-50/90 border border-blue-100/50"
          : "hover:bg-gray-50 border border-transparent hover:border-gray-100"
        }`}
    >
      {/* Direction indicator */}
      <div className="shrink-0 mt-0.5">
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-sm ${isSent
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
              className={`text-[13px] truncate ${!email.isRead
                  ? "font-semibold text-[#0B1215]"
                  : "font-medium text-[#374151]"
                }`}
            >
              {isSent ? `To: ${email.to}` : email.from}
            </span>
            {isSent && (
              <CheckCheck size={13} className="text-[#10B981] shrink-0" />
            )}
          </div>
          <span className="text-[10px] text-gray-400 font-normal shrink-0 whitespace-nowrap">
            {email.timeAgo}
          </span>
        </div>

        <p
          className={`text-[12px] truncate mb-1 ${!email.isRead
              ? "font-medium text-[#0B1215]"
              : "font-normal text-gray-600"
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
            <span className="text-[10px] text-gray-400 font-normal">
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
          className={`p-0.5 transition-opacity ${email.isStarred ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
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
    </div>
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
          className="flex items-center gap-2 text-[12px] font-medium text-gray-500 hover:text-[#0B1215] transition-colors"
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
      <div className="py-4 sm:py-5 border-b border-gray-50">
        <h3 className="text-[15px] sm:text-[17px] font-semibold text-[#0B1215] leading-tight">
          {email.subject}
        </h3>
      </div>

      {/* Sender info */}
      <div className="flex items-center justify-between py-4 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-sm ${isSent
                ? "bg-[#0B1215] text-white"
                : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white"
              }`}
          >
            {isSent ? (
              <Send size={14} className="rotate-[-30deg]" />
            ) : (
              <span className="text-[13px] sm:text-[14px] font-semibold">
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
                <span className="text-[10px] font-medium text-[#10B981] bg-emerald-50 px-2 py-0.5 rounded-full">
                  Sent
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-400">
              {isSent ? `To: ${email.toEmail}` : email.fromEmail}
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-gray-400">
          <div className="flex items-center gap-1.5">
            <Clock size={12} />
            <span className="text-[11px] font-normal">{email.timestamp}</span>
          </div>
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
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">
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
                    <p className="text-[12px] font-medium text-[#0B1215] group-hover:text-[#3B82F6] transition-colors">
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

function EmailPanel({ leadName }: { leadName: string }) {
  const [emails, setEmails] = useState<EmailMessage[]>(INITIAL_EMAILS);
  const [view, setView] = useState<"list" | "compose" | "detail">("list");
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [replyTo, setReplyTo] = useState<EmailMessage | null>(null);
  const [showDeleteEmailConfirm, setShowDeleteEmailConfirm] = useState(false);

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
    setShowDeleteEmailConfirm(true);
  };

  const confirmDelete = () => {
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
    <div className="flex-1 bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col min-h-[500px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm relative shrink-0">
            <Mail size={18} className="text-[#0B1215]" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4.5 h-4.5 sm:w-5 sm:h-5 bg-[#3B82F6] text-white text-[8px] sm:text-[9px] font-semibold rounded-full flex items-center justify-center shadow-sm">
                {unreadCount}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#0B1215] truncate">
              Email communication
            </h2>
            <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal truncate">
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
          className="flex items-center justify-center gap-2.5 px-5 sm:px-6 py-2.5 sm:py-3 bg-[#0B1215] text-white rounded-[12px] sm:rounded-[14px] text-[13px] font-semibold hover:opacity-90 transition-all shadow-md whitespace-nowrap"
          id="compose-email-btn"
        >
          <Pencil size={16} />
          Compose
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
          <>
            <EmailDetailView
              email={selectedEmail}
              onBack={() => {
                setSelectedEmail(null);
                setView("list");
              }}
              onReply={handleReply}
              onDelete={handleDelete}
            />
            <ConfirmDeleteModal
              isOpen={showDeleteEmailConfirm}
              onClose={() => setShowDeleteEmailConfirm(false)}
              onConfirm={confirmDelete}
              title="Delete Email"
              description="Are you sure you want to delete this email? This action cannot be undone."
            />
          </>
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


/* ─── Notes Panel ─────────────────────────────────────── */

function NotesPanel({ leadId, notes = [], basePath = "/agent" }: { leadId: string | number; notes: LeadNote[]; basePath?: "/admin" | "/agent" }) {
  const [noteContent, setNoteContent] = useState("");
  const { mutate: addNote, isPending } = useAddLeadNote({
    onSuccess: () => {
      setNoteContent("");
      toast.success("Note added successfully");
    }
  }, basePath);

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNote({ leadId, payload: { note: noteContent } });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 min-h-[500px]">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100 shadow-sm shrink-0">
          <FileText size={18} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#0B1215]">Notes</h2>
          <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
            <FileText size={40} className="mb-3 opacity-20" />
            <p className="text-[14px] italic">No notes yet.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-gray-700">{note.creator?.name || "System"}</span>
                <span className="text-[10px] text-gray-400">
                  {note.created_at ? new Date(note.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">{note.note}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-auto border-t border-gray-100 pt-4">
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Type a new note..."
          className="w-full h-[100px] resize-none outline-none text-[13px] text-[#374151] placeholder:text-gray-300 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3"
        />
        <button
          onClick={handleAddNote}
          disabled={!noteContent.trim() || isPending}
          className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[12px] text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Add Note"}
        </button>
      </div>
    </div>
  );
}

/* ─── Activities Panel ────────────────────────────────── */

function ActivitiesPanel({ leadId, activities = [], basePath = "/agent" }: { leadId: string | number; activities: LeadActivity[]; basePath?: "/admin" | "/agent" }) {
  const [activityType, setActivityType] = useState("call");
  const [description, setDescription] = useState("");
  const { mutate: logActivity, isPending } = useAddLeadActivity({
    onSuccess: () => {
      setDescription("");
      toast.success("Activity logged");
    }
  }, basePath);

  const handleLogActivity = () => {
    if (!description.trim()) return;
    logActivity({
      leadId,
      payload: { type: activityType, description, happened_at: new Date().toISOString() }
    });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 min-h-[500px]">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100 shadow-sm shrink-0">
          <Activity size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#0B1215]">Activities</h2>
          <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal">{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 relative before:absolute before:inset-y-0 before:left-[19px] before:w-px before:bg-gray-200">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 relative z-10 bg-white">
            <Activity size={40} className="mb-3 opacity-20" />
            <p className="text-[14px] italic">No activities yet.</p>
          </div>
        ) : (
          activities.map((act) => (
            <div key={act.id} className="relative z-10 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm">
                <Activity size={16} className="text-gray-500" />
              </div>
              <div className="flex-1 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold text-gray-700 capitalize">{act.type.replace('_', ' ')}</span>
                  <span className="text-[10px] text-gray-400">
                    {act.happened_at ? new Date(act.happened_at).toLocaleString() : ''}
                  </span>
                </div>
                <p className="text-[12px] text-gray-600 font-medium mb-1">By {act.creator?.name || "System"}</p>
                {act.description && <p className="text-[12px] text-gray-500">{act.description}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-auto border-t border-gray-100 pt-4 space-y-3">
        <SearchableSelect
          value={activityType}
          onChange={setActivityType}
          options={[
            { value: "call", label: "Call" },
            { value: "meeting", label: "Meeting" },
            { value: "email", label: "Email Sent" },
            { value: "note", label: "Note Added" },
            { value: "status_change", label: "Status Change" },
            { value: "other", label: "Other" },
          ]}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-[13px] text-gray-700"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Activity description..."
          className="w-full outline-none text-[13px] text-[#374151] placeholder:text-gray-300 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
        />
        <button
          onClick={handleLogActivity}
          disabled={!description.trim() || isPending}
          className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[12px] text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Logging..." : "Log Activity"}
        </button>
      </div>
    </div>
  );
}

/* ─── Lead Interaction Panel (Tabs) ─────────────────────── */

function LeadInteractionPanel({ leadId, leadName, notes, activities, basePath = "/agent" }: { leadId: string | number, leadName: string, notes: LeadNote[], activities: LeadActivity[], basePath?: "/admin" | "/agent" }) {
  const [activeTab, setActiveTab] = useState<"emails" | "notes" | "activities">("emails");

  return (
    <div className="flex-1 flex flex-col h-full min-h-[500px]">
      <div className="flex items-center gap-2 mb-4 bg-gray-100/50 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("emails")}
          className={`px-5 py-2 rounded-[14px] text-[12px] font-semibold transition-all ${activeTab === "emails" ? "bg-white text-[#0B1215] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Emails
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={`px-5 py-2 rounded-[14px] text-[12px] font-semibold transition-all ${activeTab === "notes" ? "bg-white text-[#0B1215] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Notes
        </button>
        <button
          onClick={() => setActiveTab("activities")}
          className={`px-5 py-2 rounded-[14px] text-[12px] font-semibold transition-all ${activeTab === "activities" ? "bg-white text-[#0B1215] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Activities
        </button>
      </div>

      <div className="flex-1 h-full min-h-0">
        {activeTab === "emails" && <EmailPanel leadName={leadName} />}
        {activeTab === "notes" && <NotesPanel leadId={leadId} notes={notes} basePath={basePath} />}
        {activeTab === "activities" && <ActivitiesPanel leadId={leadId} activities={activities} basePath={basePath} />}
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
  options: { label: string; color: string; value?: string }[];
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
                  onChange(opt.value ?? opt.label, opt.color);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color }}
                />
                <span className="text-[12px] text-[#0B1215] font-normal">
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
          <p className="text-[9px] font-semibold text-[#0B1215]">{name}</p>
          <p className="text-[7px] text-gray-500 font-normal">
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


type EditLeadForm = {
  name: string;
  phone: string;
  location: string;
  status: ApiLeadStatus;
  source: string;
  priority: ApiLeadPriority;
  assigned_to_user_id: string;
  next_action: string;
};

/* ─── Page Component ────────────────────────────────────── */

export default function LeadDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.id as string;
  const { user } = useAuthStore();
  const companyId = user?.active_company?.id;

  // Real data fetching
  const { data: leadData, isLoading } = useLead(leadId, companyId, "/agent");
  const { data: labels = [] } = useCrmLabels(companyId, "/agent");
  const { mutate: updateLead, isPending: isUpdating } = useUpdateLead({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      setIsEditing(false);
    }
  }, "/agent");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditLeadForm>({
    name: "",
    phone: "",
    location: "",
    status: "newly_lead",
    source: "",
    priority: "medium",
    assigned_to_user_id: "",
    next_action: "",
  });

  const buildEditForm = (lead: LeadApiItem): EditLeadForm => ({
    name: lead.name || "",
    phone: lead.phone || "",
    location: lead.location || "",
    status: lead.status || "newly_lead",
    source: lead.source || "",
    priority: lead.priority || "medium",
    assigned_to_user_id: lead.assigned_to_user_id ? String(lead.assigned_to_user_id) : "",
    next_action: lead.next_action || "",
  });

  const startEditing = () => {
    if (!leadData) return;
    setEditForm(buildEditForm(leadData));
    setIsEditing(true);
  };

  const updateField = <K extends keyof EditLeadForm>(field: K, value: EditLeadForm[K]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const payload: UpdateLeadPayload = {
      status: editForm.status,
      company_id: companyId,
    };
    updateLead({ leadId, payload });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] p-4 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0B1215]/20 border-t-[#0B1215] rounded-full animate-spin" />
      </div>
    );
  }

  if (!leadData) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] p-4 flex flex-col items-center justify-center">
        <h2 className="text-xl font-bold text-gray-800">Lead not found</h2>
        <button onClick={() => router.back()} className="mt-4 text-blue-500 hover:underline">Go back</button>
      </div>
    );
  }

  const currentAssigneeLabel = leadData.assignee?.name || "Unassigned";
  const statusOptions = useMemo(() => {
    if (labels.length > 0) {
      return labels.map((label) => ({ label: label.name, color: label.color, value: label.slug }));
    }
    return STATUS_OPTIONS;
  }, [labels]);
  const selectedStatusValue = isEditing ? editForm.status : (leadData.status || "newly_lead");
  const selectedStatusOption = statusOptions.find((option) => option.value === selectedStatusValue);

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-10">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl hover:bg-white/80 transition-all shrink-0"
              id="lead-back-btn"
            >
              <ArrowLeft size={22} className="text-[#0B1215]" />
            </button>
            <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#0B1215] tracking-tight truncate">
              Lead Details
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 bg-white rounded-[14px] text-[13px] font-semibold text-[#64748B] hover:border-gray-300 transition-all shadow-sm whitespace-nowrap"
              id="add-new-lead-btn"
            >
              <BookmarkPlus size={16} />
              <span className="hidden min-[480px]:inline">Add New Lead</span>
              <span className="min-[480px]:hidden">Add</span>
            </button>
            {isEditing ? (
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-70"
                id="save-lead-btn"
              >
                {isUpdating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                {isUpdating ? "Saving..." : "Save"}
              </button>
            ) : (
              <button
                onClick={startEditing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-bold hover:opacity-90 transition-all shadow-lg"
                id="edit-lead-btn"
              >
                <Pencil size={16} />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* ── Main Content Grid ───────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-8 items-stretch">
          {/* ── LEFT COLUMN ──────────────────────────────── */}
          <div className="flex-[1.2] flex flex-col gap-8 min-w-[50%]">
            {/* ── Hero Card (dark) ───────────────────────── */}
            <div className="bg-[#0B1A1E] rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col sm:flex-row gap-6 sm:gap-8">
              {/* Left Part: White Info Card */}
              <div className="flex flex-col items-center gap-4 shrink-0 w-full sm:w-[180px]">
                <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 shadow-xl flex flex-col items-center w-full">
                  <div className="relative w-24 sm:w-full aspect-square mb-4">
                    <div className="absolute inset-0 bg-black/20 rounded-[22px] blur-xl translate-y-4" />
                    <div className="relative w-full h-full rounded-[22px] overflow-hidden bg-[#FFC58E]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/avatars/male-avatar.png"
                        alt={leadData.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            `https://i.pravatar.cc/150?u=${leadData.id}`;
                        }}
                      />
                    </div>
                  </div>
                  <h3 className="text-[#0B1215] text-[18px] font-semibold text-center leading-none mb-1.5 tracking-tight">
                    {leadData.name}
                  </h3>
                  <p className="text-gray-400 text-[12px] font-normal text-center mb-3">
                    {leadData.created_at ? formatDistanceToNow(new Date(leadData.created_at), { addSuffix: true }) : "Unknown time"}
                  </p>
                  <span className="bg-[#0EA5E9] text-white text-[10px] font-semibold px-4 py-1 rounded-full uppercase tracking-tighter shadow-sm">
                    {leadData.priority || "Medium"}
                  </span>
                </div>
                {/* Action icons */}
                <div className="flex items-center gap-4">
                  <button className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-all shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100">
                    <MessageSquare size={20} className="text-[#0B1215]" />
                  </button>
                  <a href={`tel:${leadData.phone}`} className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-all shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100">
                    <Phone size={20} className="text-[#0B1215]" />
                  </a>
                </div>
              </div>

              {/* Right Part: Fields & Map */}
              <div className="flex-1 flex flex-col gap-6 w-full min-w-0">
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-4">
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Name
                    </label>
                    <p className="text-white text-[16px] font-semibold truncate">
                      {leadData.name}
                    </p>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Phone Number
                    </label>
                    <p className="text-white text-[16px] font-semibold truncate">
                      {leadData.phone || "N/A"}
                    </p>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Location
                    </label>
                    <p className="text-white text-[16px] font-semibold truncate">
                      {leadData.location || "N/A"}
                    </p>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Status
                    </label>
                    <p className="text-white text-[16px] font-semibold capitalize">
                      {(selectedStatusOption?.label || "New Lead")}
                    </p>
                  </div>
                </div>
                {/* Map */}
                <div className="w-full h-[160px] sm:flex-1 rounded-[24px] overflow-hidden shadow-inner">
                  <MapPreview name={leadData.name} />
                </div>
              </div>
            </div>

            {/* ── Lead Details Card ──────────────────────── */}
            <div className="bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex-1">
              <div className="flex items-center gap-4 mb-8 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm">
                  <Info size={20} className="text-[#0B1215]" />
                </div>
                <h2 className="text-[18px] font-semibold text-[#0B1215]">
                  Lead Details
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 sm:gap-x-12 gap-y-6 sm:gap-y-8">
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Status
                  </label>
                  <PillDropdown
                    value={selectedStatusOption?.label || "New Lead"}
                    color={selectedStatusOption?.color || "#2563EB"}
                    options={statusOptions}
                    onChange={(value) => {
                      updateField("status", value as ApiLeadStatus);
                    }}
                    disabled={!isEditing}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Uploaded By
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold">
                    {leadData.creator?.name || "System"}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Last Interaction
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadData.last_interaction || "None"}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Source
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadData.source || "Unknown"}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Assign to
                  </label>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-medium w-fit" style={{ backgroundColor: leadData.assignee ? "#3B82F6" : "#EF4444" }}>
                    {currentAssigneeLabel}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Next Action
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadData.next_action || "None"}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Priority
                  </label>
                  <PillDropdown
                    value={isEditing ? (editForm.priority ? editForm.priority.charAt(0).toUpperCase() + editForm.priority.slice(1) : "Medium") : (leadData.priority ? leadData.priority.charAt(0).toUpperCase() + leadData.priority.slice(1) : "Medium")}
                    color={PRIORITY_OPTIONS.find(o => o.label.toLowerCase() === (isEditing ? editForm.priority : leadData.priority))?.color || "#3B82F6"}
                    options={PRIORITY_OPTIONS}
                    onChange={(label) => {
                      updateField("priority", label.toLowerCase() as ApiLeadPriority);
                    }}
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Created
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold">
                    {leadData.created_at ? new Date(leadData.created_at).toLocaleDateString() : "Unknown"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Interaction Panel ─────── */}
          <LeadInteractionPanel
            leadId={leadId}
            leadName={leadData.name}
            notes={leadData.notes || []}
            activities={leadData.activities || []}
            basePath="/agent"
          />
        </div>
      </div>
    </div>
  );
}

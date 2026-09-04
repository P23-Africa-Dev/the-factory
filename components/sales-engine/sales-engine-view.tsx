"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { IcpBuilderModal } from "./icp-builder-modal";
import { ChatMessageBody } from "./chat-message-body";
import { SearchableSelect, type SelectOption } from "@/components/ui/searchable-select";
import { useActivateIcpProfile, useActiveIcpProfile, useIcpProfiles } from "@/hooks/use-sales-engine-icp";
import { isMissingActiveIcp, useSendChatMessage } from "@/hooks/use-sales-engine-chat";
import { useSalesEngineMetrics } from "@/hooks/use-sales-engine-metrics";
import { useSalesEngineOutreach } from "@/hooks/use-sales-engine-outreach";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatRelativeTime, type ChatIntent, type ChatLead } from "@/lib/api/sales-engine";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Copy,
  Expand,
  Globe2,
  Lightbulb,
  Loader2,
  MessageCircle,
  Minimize2,
  MoreVertical,
  Plus,
  Scan,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  body: string;
  intent?: ChatIntent;
  leads?: ChatLead[];
};

type ActionIntent = Exclude<ChatIntent, "freeform">;
type SalesEngineTab = "smart-lead" | "social-listening";
type SocialSignal = {
  id: number;
  signal: string;
  summary?: string;
  source: "LinkedIn Post" | "X/Twitter Post" | "Reddit Post" | "Google Search";
  sourceIcon: string;
  persona: string;
  company: string;
  location: string;
  intent: string;
  intentColor: string;
  description: string;
  score: number;
  profile: string;
  reasons: string[];
  signalType: string;
  buyingStage: string;
  problem: string;
  urgency: string;
  suggestedMessage: string;
  postUrl?: string;
  entityType?: "company" | "individual";
  industry?: string;
  keyTopics?: string[];
  competitors?: string[];
  followUpStrategy?: string;
  recommendedAction?: {
    title: string;
    detail: string;
  };
};

type SocialStatCard = {
  title: string;
  value: string;
  percent: string;
  unit: string;
  active?: boolean;
};

const INTENT_PLACEHOLDERS: Record<ChatIntent, string> = {
  freeform: "Ask or search anything",
  quick_research: "Research market trends, competitors, or industry signals…",
  generate_leads: "Who are the top business prospects in your target market?",
  create_outreach: "Draft a follow-up email or WhatsApp message for…",
};

const INTENT_MODE_CONFIG: Record<
  ActionIntent,
  { label: string; tint: string; chipTint: string; icon: ReactNode }
> = {
  quick_research: {
    label: "Quick Research",
    tint: "bg-[#fffbdc]",
    chipTint: "bg-[#fff4a8] text-[#09232d]",
    icon: <Globe2 size={12} className="shrink-0" />,
  },
  generate_leads: {
    label: "Generate New Leads",
    tint: "bg-[#e4faff]",
    chipTint: "bg-[#c8f0ff] text-[#09232d]",
    icon: <UsersRound size={12} className="shrink-0" />,
  },
  create_outreach: {
    label: "Create Outreach",
    tint: "bg-[#f2ffe9]",
    chipTint: "bg-[#dfffc8] text-[#09232d]",
    icon: <Lightbulb size={12} className="shrink-0" />,
  },
};

const thinkingStagesByIntent: Record<ChatIntent, readonly string[]> = {
  freeform: ["Thinking…"],
  quick_research: [
    "Decomposing your research question…",
    "Scanning web & registries…",
    "Cross-referencing signals…",
    "Synthesizing insights…",
  ],
  generate_leads: [
    "Analyzing your brief…",
    "Scanning web & social signals…",
    "Extracting buying intent…",
    "Compiling ranked results…",
  ],
  create_outreach: [
    "Reviewing target context…",
    "Drafting message…",
    "Checking compliance tone…",
  ],
};

const weekDays = ["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];
const salesEngineTabs: Array<{ id: SalesEngineTab; label: string }> = [
  { id: "smart-lead", label: "Smart Lead" },
  { id: "social-listening", label: "Social Listening" },
];

const socialStatCards: SocialStatCard[] = [
  { title: "Signals Detected", value: "4,100", percent: "73", unit: "Signals", active: true },
  { title: "High Opportunities", value: "1,100", percent: "43", unit: "Opportunities" },
  { title: "Added to CRM", value: "34", percent: "43", unit: "Opportunities" },
];

const socialSignals: SocialSignal[] = [
  {
    id: 1,
    signal: "We're looking to automate our B2B outbound pipeline in Kenya. Most global AI sales SDR tools hallucinate or fail on Kenyan local company domains. Recommendations for platforms that actually understand East Africa?",
    summary: "Seeking East Africa-native AI sales SDR tools to automate B2B outbound pipeline.",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Head of Growth & AI",
    company: "Savannah AI Labs",
    location: "Nairobi (Westlands), Kenya\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Outbound AI sales automation search",
    score: 94,
    profile: "Esther Nyambura",
    reasons: [
      "Explicit bottleneck with Western sales automation tools",
      "Head of Growth actively seeking verified regional tools",
      "Decision maker with allocated software budget",
      "High fit with Factory 23 Sales Engine ICP",
      "Recent activity (Posted 1 hour ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Evaluation",
    problem: "Global AI SDRs lacking East African B2B firmographic data",
    urgency: "High",
    entityType: "company",
    industry: "Enterprise AI & Cloud Services",
    keyTopics: ["AI Sales SDR", "B2B Lead Generation", "Outbound Automation"],
    competitors: ["11x.ai", "Regie.ai", "Apollo.io"],
    followUpStrategy: "Share our East Africa B2B firmographic benchmark and demonstrate verified lead enrichment in Nairobi.",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi Esther,\nI saw your post on automating B2B outbound in Kenya. Most Western AI SDRs fail because they lack local domain directories and verified phone data. Factory 23 Sales Engine is trained specifically on East African commercial registries and intent data.",
    recommendedAction: {
      title: "Reach out within 2 hours",
      detail: "Share our East Africa B2B firmographic benchmark and offer a 15-minute SDR workflow walkthrough.",
    },
  },
  {
    id: 2,
    signal: "best ai customer support automation mpesa daraja api kenya",
    summary: "Evaluating AI customer support automation integrated with M-Pesa Daraja APIs.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Chief Technology Officer",
    company: "Kilimani Microfinance",
    location: "Nairobi (Kilimani), Kenya\n101-250 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "Automating M-Pesa billing inquiries",
    score: 91,
    profile: "Kevin Kiprop",
    reasons: [
      "High-intent inbound search for automated M-Pesa customer support",
      "CTO evaluating API-driven alternatives to legacy helpdesks",
      "Core operational bottleneck with STK push reversal queries",
      "Regulated financial institution with enterprise budget",
      "Recent search activity (Detected 1 hour ago)",
    ],
    signalType: "Switching",
    buyingStage: "Solution Evaluation",
    problem: "High volume M-Pesa STK push failed payment support tickets",
    urgency: "High",
    entityType: "company",
    industry: "Fintech & Digital Lending",
    keyTopics: ["M-Pesa Daraja API", "AI Customer Support", "Payment Reconciliation"],
    competitors: ["Zendesk", "Freshchat", "Custom Python Bot"],
    followUpStrategy: "Offer an architecture review demonstrating real-time M-Pesa transaction lookup and automated conversational resolution.",
    postUrl: "https://www.google.com/search?q=best+ai+customer+support+automation+mpesa+daraja+api+kenya",
    suggestedMessage:
      "Hi Kevin,\nSaw your team is exploring AI support automation for M-Pesa Daraja payment workflows. We integrate directly with Daraja APIs to resolve failed STK push inquiries and instant reversals without human agent delay.",
    recommendedAction: {
      title: "Schedule architecture scoping call",
      detail: "Offer technical review demonstrating real-time M-Pesa Daraja payment query resolution.",
    },
  },
  {
    id: 3,
    signal: "Our manual invoice data entry for KRA eTIMS is becoming a nightmare across 400+ FMCG distributor accounts. Anyone using an AI vision agent that extracts Kenyan tax invoices with >99% accuracy?",
    summary: "Seeking high-accuracy AI vision extraction for KRA eTIMS invoices across 400+ distributors.",
    source: "X/Twitter Post",
    sourceIcon: "X",
    persona: "VP of Engineering",
    company: "Twiga Logistics",
    location: "Nairobi (Industrial Area), Kenya\n201-500 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "AI eTIMS invoice extraction RFP",
    score: 89,
    profile: "Brian Otieno",
    reasons: [
      "Severe operational overhead from manual eTIMS tax compliance",
      "Executive tech buyer seeking enterprise-grade AI extraction",
      "400+ distributor network represents high-volume pipeline",
      "Immediate quarterly compliance deadline",
      "Recent activity (Posted 2 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Selection",
    problem: "Manual KRA eTIMS invoice processing creating delivery bottlenecks",
    urgency: "High",
    entityType: "company",
    industry: "Supply Chain & FMCG Distribution",
    keyTopics: ["KRA eTIMS", "Document AI", "Invoice OCR", "Supply Chain"],
    competitors: ["ABBYY", "Google Document AI", "Manual Data Entry"],
    followUpStrategy: "Share a sample OCR evaluation test processing Kenyan VAT & eTIMS QR codes with sub-second extraction.",
    postUrl: "https://x.com/search?q=etims+ai+invoice",
    suggestedMessage:
      "Hi Brian,\nHandling KRA eTIMS invoices manually across hundreds of distributors creates serious compliance delays. We build localized vision-language extraction models optimized for Kenyan PINs and eTIMS QR formats.",
    recommendedAction: {
      title: "Send eTIMS OCR sample extraction test",
      detail: "Demonstrate sub-second vision extraction on Kenyan VAT and eTIMS QR invoice batches.",
    },
  },
  {
    id: 4,
    signal: "How much does it cost in Kenya to build or buy an AI WhatsApp chatbot that answers farmer queries in Swahili and English?",
    summary: "Scoping pricing and budget for a bilingual Swahili/English AI WhatsApp chatbot.",
    source: "Reddit Post",
    sourceIcon: "r",
    persona: "Managing Director",
    company: "Rift Valley AgriTech",
    location: "Nakuru, Kenya\n20-50 employees",
    intent: "Price",
    intentColor: "#67b7f4",
    description: "Swahili LLM chatbot pricing",
    score: 83,
    profile: "Faith Muthoni",
    reasons: [
      "Active buyer researching budget for localized AI agent",
      "Specific multilingual demand (English & Swahili)",
      "Decision maker with allocated agribusiness capital",
      "Recent activity (Posted 2 hours ago)",
    ],
    signalType: "Price",
    buyingStage: "Budgeting",
    problem: "High cost of hiring bilingual agronomy call agents",
    urgency: "Medium",
    entityType: "company",
    industry: "Agritech & Smart Farming",
    keyTopics: ["Swahili NLP", "WhatsApp AI Agent", "Agritech Chatbot"],
    competitors: ["Turn.io", "Yellow.ai", "Twilio Flex"],
    followUpStrategy: "Send our WhatsApp AI Chatbot Cost & ROI calculator for Kenyan agribusinesses.",
    postUrl: "https://www.reddit.com/r/Kenya/",
    suggestedMessage:
      "Hi Faith,\nBuilding bilingual English/Swahili AI WhatsApp bots for smallholder farming no longer requires tens of thousands of dollars. We can share benchmark pricing and architecture patterns running on localized open LLMs.",
    recommendedAction: {
      title: "Send WhatsApp AI Chatbot Cost & ROI calculator",
      detail: "Provide benchmark pricing for bilingual English/Swahili conversational models.",
    },
  },
  {
    id: 5,
    signal: "predictive ai credit scoring and churn reduction software for saccos kenya",
    summary: "Researching predictive AI credit scoring and member churn reduction software for SACCOs.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Head of Digital Channels",
    company: "Harambee Sacco",
    location: "Nairobi (Upper Hill), Kenya\n201-500 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "SACCO credit scoring & churn reduction",
    score: 92,
    profile: "Dennis Odhiambo",
    reasons: [
      "Direct search query for SACCO predictive intelligence software",
      "Tier-1 cooperative institution subject to SASRA guidelines",
      "Urgent operational need to curb member loan defaults",
      "Recent search activity (Detected 2 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Evaluation",
    problem: "Member loan defaults and account dormancy in Tier-1 SACCOs",
    urgency: "High",
    entityType: "company",
    industry: "SACCO & Cooperative Banking",
    keyTopics: ["SACCO AI", "Credit Scoring", "Member Retention", "Predictive Churn"],
    competitors: ["Coretec", "Finserve", "Legacy SAS Models"],
    followUpStrategy: "Offer a confidential briefing showcasing predictive member churn models tailored for SASRA-regulated SACCOs.",
    postUrl: "https://www.google.com/search?q=predictive+ai+credit+scoring+saccos+kenya",
    suggestedMessage:
      "Hi Dennis,\nModern SACCOs in Kenya are shifting from reactive loan recovery to predictive AI health scoring. We've modeled member contribution patterns to flag churn and default risks 60 days in advance.",
    recommendedAction: {
      title: "Request confidential SACCO analytics briefing",
      detail: "Present predictive member churn and loan default risk scorecards tailored for SASRA institutions.",
    },
  },
  {
    id: 6,
    signal: "We are evaluating AI triage assistants for private clinics across Western Kenya. Needs to work smoothly over low-bandwidth mobile networks and sync back to our EMR.",
    summary: "Evaluating offline-capable, low-bandwidth AI clinical triage assistants for Western Kenya clinics.",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Commercial Operations Director",
    company: "Boma Care Health",
    location: "Eldoret, Kenya\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Clinical AI triage for Western Kenya",
    score: 88,
    profile: "Mercy Chebet",
    reasons: [
      "Large regional healthcare network expanding clinical capacity",
      "Clear technical requirement (low-bandwidth offline sync)",
      "Executive stakeholder with procurement mandate",
      "Recent activity (Posted 3 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Consideration",
    problem: "Clinic nurse overwhelm during morning outpatient surges",
    urgency: "Medium-High",
    entityType: "company",
    industry: "Healthcare & Telemedicine",
    keyTopics: ["Clinical AI Triage", "Offline First", "EMR Integration"],
    competitors: ["Babyl", "Ada Health", "Paper Records"],
    followUpStrategy: "Share a technical overview of lightweight edge-LLM triage deployed over offline-capable Progressive Web Apps.",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi Mercy,\nOutpatient triage in regional health networks requires ultra-low bandwidth models that don't stall when fiber is down. We specialize in offline-first AI workflow engines for Kenyan healthcare providers.",
    recommendedAction: {
      title: "Share offline-first clinical AI whitepaper",
      detail: "Demonstrate lightweight edge-LLM triage architecture for distributed regional clinics.",
    },
  },
  {
    id: 7,
    signal: "ai route optimization dynamic fuel tracking kenya northern corridor",
    summary: "Searching for AI route optimization and dynamic fuel tracking along the Northern Corridor.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Chief Executive Officer",
    company: "SafariFleet Logistics",
    location: "Mombasa, Kenya\n51-200 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "Fleet AI route optimization & fuel leak prevention",
    score: 87,
    profile: "David Kamau",
    reasons: [
      "Commercial freight operator looking to cut fleet overhead",
      "Northern corridor haulage heavily penalized by transit delays",
      "Direct CEO intent to replace passive GPS trackers with predictive AI",
      "Recent search activity (Detected 3 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Solution Discovery",
    problem: "High fuel theft and suboptimal transit times between Mombasa port and Nairobi",
    urgency: "High",
    entityType: "company",
    industry: "Haulage & Marine Logistics",
    keyTopics: ["Northern Corridor", "AI Route Optimization", "Fuel Telematics", "IoT Fleet"],
    competitors: ["Cartrack Kenya", "Tramigo", "Manual GPS Logs"],
    followUpStrategy: "Provide our Northern Corridor transit benchmark showing 18% fuel savings via predictive traffic & weighbridge routing.",
    postUrl: "https://www.google.com/search?q=ai+route+optimization+dynamic+fuel+tracking+kenya",
    suggestedMessage:
      "Hi David,\nManaging long-haul truck turnaround times between Mombasa Port and inland depots is heavily impacted by weighbridge congestion. Our AI dispatch models dynamically reroute trucks and audit fuel sensor anomalies in real-time.",
    recommendedAction: {
      title: "Send Northern Corridor fuel telematics benchmark",
      detail: "Showcase dynamic route optimization and real-time weighbridge avoidance analytics.",
    },
  },
  {
    id: 8,
    signal: "HubSpot is charging us $1,200/mo and doesn't even have automated WhatsApp triggers for East African phone numbers. Looking to switch to a modern AI CRM built for our market.",
    summary: "Looking to replace HubSpot ($1,200/mo) with an AI CRM featuring East African WhatsApp triggers.",
    source: "X/Twitter Post",
    sourceIcon: "X",
    persona: "Head of Marketing",
    company: "Kifaru Pay",
    location: "Nairobi (Kilimani), Kenya\n20-50 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "Replacing HubSpot with WhatsApp AI CRM",
    score: 90,
    profile: "Sharon Achieng",
    reasons: [
      "High SaaS friction and price dissatisfaction with HubSpot",
      "Critical need for automated WhatsApp triggers in sales pipeline",
      "Marketing director holds direct credit card buying authority",
      "Recent activity (Posted 4 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Vendor Evaluation",
    problem: "High SaaS overhead with zero localized messaging automation",
    urgency: "High",
    entityType: "company",
    industry: "Fintech & Merchant Payments",
    keyTopics: ["CRM Migration", "WhatsApp Triggers", "SaaS Cost Reduction"],
    competitors: ["HubSpot CRM", "ActiveCampaign", "Zoho CRM"],
    followUpStrategy: "Send a migration matrix showing 65% software cost reduction with native Safaricom/Airtel SMS and WhatsApp automation.",
    postUrl: "https://x.com/search?q=hubspot+alternative+kenya",
    suggestedMessage:
      "Hi Sharon,\nPaying exorbitant enterprise fees for US CRMs that lack native WhatsApp webhook automation is a common pain in Nairobi. Factory 23 Sales Engine includes native WhatsApp cadences and automated lead scoring built for African sales teams.",
    recommendedAction: {
      title: "Deliver HubSpot replacement cost comparison",
      detail: "Highlight 65% software savings and native East African WhatsApp sales triggers.",
    },
  },
  {
    id: 9,
    signal: "automated ai lead qualification tool for paygo solar sales reps nairobi",
    summary: "Searching for automated AI lead qualification tools for distributed PayGo solar field sales.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Operations Lead",
    company: "Simba Solar Energy",
    location: "Nairobi (Westlands), Kenya\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Pay-As-You-Go solar lead qualification",
    score: 86,
    profile: "Patrick Kariuki",
    reasons: [
      "High-intent search for automated solar sales pre-qualification",
      "Distributed sales force requires mobile lead verification",
      "High commercial viability in off-grid renewable distribution",
      "Recent search activity (Detected 4 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Selection",
    problem: "Field reps spending 60% of time pursuing unqualified off-grid leads",
    urgency: "Medium-High",
    entityType: "company",
    industry: "Renewable Energy & PayGo",
    keyTopics: ["PayGo Solar", "Lead Qualification", "Field Sales Enablement"],
    competitors: ["Angaza", "Salesforce Energy", "Manual Excel Sheets"],
    followUpStrategy: "Share case study on automated credit pre-qualification scoring via mobile data proxies.",
    postUrl: "https://www.google.com/search?q=automated+ai+lead+qualification+paygo+solar+kenya",
    suggestedMessage:
      "Hi Patrick,\nField agents in solar distribution waste immense hours on leads who fail subsequent credit checks. Our AI lead scoring engine validates phone, location, and propensity data before reps even hit the field.",
    recommendedAction: {
      title: "Send PayGo pre-qualification case study",
      detail: "Illustrate automated lead verification before dispatching field sales agents.",
    },
  },
  {
    id: 10,
    signal: "What are leading private hospitals in East Africa paying for AI transcription and clinical documentation assistants?",
    summary: "Benchmarking market pricing for clinical AI transcription and documentation assistants.",
    source: "Reddit Post",
    sourceIcon: "r",
    persona: "Chief Medical Officer",
    company: "Mara Health System",
    location: "Nairobi (Parklands), Kenya\n501-1000 employees",
    intent: "Price",
    intentColor: "#67b7f4",
    description: "Clinical AI transcription budgeting",
    score: 85,
    profile: "Dr. Amina Yusuf",
    reasons: [
      "Executive decision maker budgeting hospital AI rollouts",
      "Looking for market pricing benchmarks for medical transcription",
      "Severe documentation backlog impacting doctor retention",
      "Recent activity (Posted 5 hours ago)",
    ],
    signalType: "Price",
    buyingStage: "Budget Allocation",
    problem: "Doctors spending 3 hours daily typing patient notes into legacy hospital software",
    urgency: "Medium",
    entityType: "company",
    industry: "Hospital Networks & Specialized Clinics",
    keyTopics: ["Clinical AI", "Medical Transcription", "Doctor Burnout"],
    competitors: ["Nuance DAX", "Abridge", "Manual Transcriptionists"],
    followUpStrategy: "Share our healthcare AI economics breakdown with compliant local data hosting.",
    postUrl: "https://www.reddit.com/r/Kenya/",
    suggestedMessage:
      "Hi Dr. Yusuf,\nPhysician documentation burden is acute across major hospital centers in Nairobi. We can share a transparent breakdown of speech-to-clinical note AI models fine-tuned on East African medical accents and terminology.",
    recommendedAction: {
      title: "Provide clinical documentation economics breakdown",
      detail: "Share compliant local hosting options and doctor time-saving metrics.",
    },
  },
  {
    id: 11,
    signal: "Looking for an automated AI agent to conduct continuous SOC2 and Kenya Data Protection Act (KDPA) compliance audits across our AWS infrastructure.",
    summary: "Seeking an automated AI agent for continuous SOC2 and KDPA compliance audits on AWS.",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Chief Information Security Officer",
    company: "Lake Basin FinTech",
    location: "Kisumu, Kenya\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "AI KDPA & SOC2 compliance auditing",
    score: 93,
    profile: "Victor Omondi",
    reasons: [
      "Regulatory enforcement by ODPC creating compliance urgency",
      "CISO actively evaluating continuous compliance automation",
      "High-value fintech tier with immediate audit timeline",
      "Recent activity (Posted 5 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Partner Selection",
    problem: "Pending Office of Data Protection Commissioner (ODPC) annual audit compliance",
    urgency: "High",
    entityType: "company",
    industry: "Financial Services & Payment Gateway",
    keyTopics: ["KDPA Compliance", "SOC2 Audit", "Automated Security Agent"],
    competitors: ["Vanta", "Drata", "Big 4 Advisory"],
    followUpStrategy: "Provide an automated KDPA compliance mapping matrix illustrating continuous control monitoring.",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi Victor,\nODPC regulatory audits in Kenya require clear data residency and processing telemetry. Our automated governance agents monitor cloud permissions and flag non-compliant data flows 24/7.",
    recommendedAction: {
      title: "Deliver KDPA compliance mapping matrix",
      detail: "Show continuous AWS permissions monitoring aligned with ODPC regulations.",
    },
  },
  {
    id: 12,
    signal: "ai automated inventory demand forecasting fmcg distributors kenya",
    summary: "Researching AI inventory demand forecasting and stockout prevention for FMCG distribution.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Commercial Director",
    company: "Tatu Retail Hub",
    location: "Thika, Kenya\n101-250 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "AI FMCG inventory & stockout forecasting",
    score: 88,
    profile: "Wanjiku Mwangi",
    reasons: [
      "Direct search query for predictive FMCG inventory planning",
      "Commercial leader seeking to replace manual spreadsheet forecasting",
      "Fast-expanding warehouse footprint in Kiambu County",
      "Recent search activity (Detected 6 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Research",
    problem: "Excess stock in slow lines and frequent stockouts in fast-moving staples",
    urgency: "Medium-High",
    entityType: "company",
    industry: "Wholesale & FMCG Distribution",
    keyTopics: ["Demand Forecasting", "Stockout Prevention", "FMCG Supply Chain"],
    competitors: ["SAP Business One", "Sage Evolution", "Excel Forecasting"],
    followUpStrategy: "Schedule demo showcasing dynamic safety stock optimization based on historical regional order cycles.",
    postUrl: "https://www.google.com/search?q=ai+automated+inventory+demand+forecasting+kenya",
    suggestedMessage:
      "Hi Wanjiku,\nFMCG distributors lose substantial margin to stockouts on key staples while holding dead inventory elsewhere. Our predictive replenishment engine accurately models localized supermarket demand cycles.",
    recommendedAction: {
      title: "Schedule demand replenishment demo",
      detail: "Showcase dynamic safety stock models based on historical Kenyan order cycles.",
    },
  },
  {
    id: 13,
    signal: "Traditional SMS recovery blasts have a 4% collection rate. Any fintechs using conversational AI voice/chat agents for ethical debt recovery in Kenya?",
    summary: "Evaluating conversational AI voice and chat agents for ethical micro-loan recovery.",
    source: "X/Twitter Post",
    sourceIcon: "X",
    persona: "Head of Digital Lending",
    company: "PesaQuick Micro-Loans",
    location: "Nairobi (Upper Hill), Kenya\n20-50 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "AI conversational debt collection",
    score: 90,
    profile: "Collins Koech",
    reasons: [
      "Direct pain point with one-way SMS collection failure",
      "Lending head searching for two-way conversational agents",
      "Immediate revenue uplift from improved loan recovery",
      "Recent activity (Posted 6 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Vendor Evaluation",
    problem: "Skyrocketing NPLs and low borrower responsiveness to one-way SMS",
    urgency: "High",
    entityType: "company",
    industry: "Digital Lending & Microfinance",
    keyTopics: ["Debt Collection AI", "NPL Recovery", "Conversational AI"],
    competitors: ["Manual Call Centers", "Bulk SMS Blasts"],
    followUpStrategy: "Share conversion statistics of two-way conversational recovery agents operating in Swahili and English.",
    postUrl: "https://x.com/search?q=ai+debt+collection+kenya",
    suggestedMessage:
      "Hi Collins,\nOne-way SMS collections alienate borrowers and produce single-digit recovery. Conversational AI recovery agents that negotiate realistic installment plans recover up to 3x more capital while maintaining regulatory goodwill.",
    recommendedAction: {
      title: "Share conversational recovery benchmark",
      detail: "Present data showing 3x higher capital recovery using two-way conversational agents.",
    },
  },
  {
    id: 14,
    signal: "How much are Kenyan software agencies charging to implement an AI document search engine over company contracts and policies?",
    summary: "Scoping agency implementation costs for an enterprise RAG contract search engine.",
    source: "Reddit Post",
    sourceIcon: "r",
    persona: "Founder & CEO",
    company: "Individual",
    location: "Nairobi, Kenya",
    intent: "Price",
    intentColor: "#67b7f4",
    description: "Enterprise RAG search implementation cost",
    score: 76,
    profile: "Beatrice Wambui",
    reasons: [
      "Founder actively scoping private RAG search implementation",
      "Pricing discovery indicates committed near-term project",
      "Recent activity (Posted 7 hours ago)",
    ],
    signalType: "Price",
    buyingStage: "Budgeting",
    problem: "Staff spending hours locating clauses in legacy legal PDFs",
    urgency: "Medium",
    entityType: "individual",
    industry: "Corporate Services & Legal Tech",
    keyTopics: ["RAG Search", "Contract AI", "Knowledge Base"],
    competitors: ["Glean", "Custom LangChain Project", "SharePoint Search"],
    followUpStrategy: "Share our phased enterprise RAG roadmap with transparent fixed milestones.",
    postUrl: "https://www.reddit.com/r/Kenya/",
    suggestedMessage:
      "Hi Beatrice,\nSetting up private document RAG pipelines for contracts can be done securely without open-ended agency bills. We can outline a quick proof-of-concept timeline that indexes your repository within days.",
    recommendedAction: {
      title: "Send enterprise RAG proof-of-concept roadmap",
      detail: "Outline fixed milestone pricing and private indexing of company contracts.",
    },
  },
  {
    id: 15,
    signal: "b2b ai sales prospecting software verified east africa contact numbers",
    summary: "Searching for B2B sales prospecting software with verified East African phone numbers.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Head of Sales",
    company: "Chui Logistics & Warehousing",
    location: "Mombasa, Kenya\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Verified East African phone & email data search",
    score: 94,
    profile: "Samuel Karanja",
    reasons: [
      "High purchase intent for localized B2B sales intelligence",
      "Sales head frustrated with Western data provider inaccuracy",
      "Direct fit with Factory 23 primary value proposition",
      "Recent search activity (Detected 7 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Selection",
    problem: "Lusha, ZoomInfo, and Apollo having 80%+ bounce rates on Kenyan contacts",
    urgency: "High",
    entityType: "company",
    industry: "Warehousing & Cold Chain",
    keyTopics: ["Verified Contact Data", "B2B Data Accuracy", "Sales Prospecting"],
    competitors: ["ZoomInfo", "Lusha", "Apollo.io"],
    followUpStrategy: "Provide a verified batch of 30 logistics decision-makers in Mombasa and Nairobi with live phone verification.",
    postUrl: "https://www.google.com/search?q=b2b+ai+sales+prospecting+software+kenya",
    suggestedMessage:
      "Hi Samuel,\nUS-centric data platforms have abysmal coverage in East Africa, resulting in wasted sales rep hours. Factory 23 maintains verified direct mobile and WhatsApp indexes for commercial leaders across Kenya.",
    recommendedAction: {
      title: "Provide sample verified lead batch",
      detail: "Deliver 30 verified logistics decision-makers in Mombasa and Nairobi with direct mobile data.",
    },
  },
  {
    id: 16,
    signal: "We receive 1,500+ applications per open engineering role. Looking for an AI resume screening platform that understands Kenyan university degrees and local tech bootcamps.",
    summary: "Seeking an AI resume screening tool tuned to Kenyan university degrees and tech bootcamps.",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Head of People & Culture",
    company: "AfriTalent Solutions",
    location: "Nairobi (Kilimani), Kenya\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "AI applicant screening with local context",
    score: 82,
    profile: "Grace Mwangi",
    reasons: [
      "High volume applicant strain during hiring cycles",
      "Specific localized requirement for Kenyan educational context",
      "HR buyer seeking automated parsing tools",
      "Recent activity (Posted 8 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Consideration",
    problem: "HR drowning in manual CV reviews; Western ATS filters rejecting qualified local talent",
    urgency: "Medium-High",
    entityType: "company",
    industry: "Human Resources & Recruitment",
    keyTopics: ["AI Resume Screening", "ATS Automation", "Technical Hiring"],
    competitors: ["Workable", "Lever", "Ashby"],
    followUpStrategy: "Demonstrate localized semantic resume parser recognizing Kenyan tech institutions and practical GitHub experience.",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi Grace,\nStandard Western ATS filters miss exceptional local engineers from Moringa, ALX, and JKUAT because of rigid keyword templates. We build intelligent applicant ranking models tuned to local engineering pipelines.",
    recommendedAction: {
      title: "Demonstrate localized semantic resume parser",
      detail: "Show how local tech bootcamp and university qualifications are ranked accurately.",
    },
  },
  {
    id: 17,
    signal: "ai vision quality grading conveyor belt automated sorting kenya",
    summary: "Searching for conveyor belt computer vision AI for automated export quality grading.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Managing Director",
    company: "Victoria Fish Processors",
    location: "Kisumu, Kenya\n101-250 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Computer vision fish quality grading",
    score: 85,
    profile: "Juma Omondi",
    reasons: [
      "Industrial exporter seeking automated quality sorting",
      "Direct commercial risk from export cargo quality rejections",
      "Managing Director driving smart manufacturing investments",
      "Recent search activity (Detected 8 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Research",
    problem: "Manual grading errors causing EU export rejection penalties",
    urgency: "High",
    entityType: "company",
    industry: "Agri-Food Processing & Export",
    keyTopics: ["Computer Vision", "Industrial AI", "Quality Control"],
    competitors: ["Marel", "Manual Inspectors"],
    followUpStrategy: "Provide case studies on real-time edge vision inspection deployed in industrial food processing.",
    postUrl: "https://www.google.com/search?q=ai+vision+quality+grading+conveyor+belt+kenya",
    suggestedMessage:
      "Hi Juma,\nAutomating export grade classification on high-speed conveyor lines eliminates costly shipment rejections at port. We deploy rugged edge AI vision cameras that grade product dimensions and freshness in real-time.",
    recommendedAction: {
      title: "Send industrial edge vision case study",
      detail: "Demonstrate real-time fish size and freshness grading on high-speed conveyor lines.",
    },
  },
  {
    id: 18,
    signal: "Trying to integrate local Kenyan payment gateways (Paybill, Till, Bank EFT) into our SaaS. Anyone solved automated webhook reconciliations without writing 5,000 lines of custom glue code?",
    summary: "Seeking turnkey automated webhook reconciliation for M-Pesa Paybill, Till, and local banks.",
    source: "X/Twitter Post",
    sourceIcon: "X",
    persona: "Founder",
    company: "Kipawa Tech",
    location: "Eldoret, Kenya\n11-50 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "Automating payment reconciliation webhooks",
    score: 87,
    profile: "Kipchumba Bett",
    reasons: [
      "Technical founder facing high engineering burden on payment ops",
      "Seeking turnkey webhook reconciliation infrastructure",
      "Near-term launch dependency",
      "Recent activity (Posted 9 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Vendor Evaluation",
    problem: "Silent webhook drops and manual ledger balancing on Daraja APIs",
    urgency: "High",
    entityType: "company",
    industry: "SaaS & Cloud Software",
    keyTopics: ["M-Pesa Webhooks", "Automated Reconciliation", "Fintech Infrastructure"],
    competitors: ["Custom In-house Scripts", "Manual Spreadsheet Tally"],
    followUpStrategy: "Share architecture diagram of our zero-drop transactional payment event bus.",
    postUrl: "https://x.com/search?q=daraja+mpesa+reconciliation",
    suggestedMessage:
      "Hi Kipchumba,\nDaraja webhook drops during Safaricom maintenance windows cause major billing headaches. We provide resilient event-driven reconciliation connectors that auto-retry and balance your SaaS ledger automatically.",
    recommendedAction: {
      title: "Share zero-drop payment webhook architecture",
      detail: "Provide resilient event-driven retry connectors for M-Pesa Daraja and local banks.",
    },
  },
  {
    id: 19,
    signal: "Replacing our enterprise ERP dispatch module. Looking for a vendor that integrates AI dynamic route planning with live WhatsApp delivery notifications for pharmacies across Kenya.",
    summary: "Replacing ERP dispatch with AI dynamic routing and live customer WhatsApp delivery alerts.",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Chief Operating Officer",
    company: "Nairobi Med Supplies",
    location: "Nairobi (Industrial Area), Kenya\n51-200 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "AI pharma route dispatch & WhatsApp tracking",
    score: 89,
    profile: "Lucy Njeri",
    reasons: [
      "Mission-critical supply chain optimization for medicine distribution",
      "COO looking to replace rigid legacy dispatch software",
      "Direct requirement for AI routing and WhatsApp alerts",
      "Recent activity (Posted 9 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Solution Evaluation",
    problem: "Cold-chain pharmaceutical delivery delays and manual customer verification calls",
    urgency: "High",
    entityType: "company",
    industry: "Pharmaceuticals & Healthcare Supply",
    keyTopics: ["Pharma Dispatch", "Dynamic Routing", "WhatsApp Automation"],
    competitors: ["SAP", "Microsoft Dynamics", "Manual Dispatchers"],
    followUpStrategy: "Present live dispatch console showing multi-stop route optimization with real-time customer WhatsApp delivery alerts.",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi Lucy,\nDelivering medical supplies on tight cold-chain schedules requires intelligent multi-stop routing and transparent recipient alerts. We connect your ERP straight into automated route planning and instant WhatsApp status updates.",
    recommendedAction: {
      title: "Present live dispatch console demo",
      detail: "Illustrate multi-stop route optimization connected with real-time customer WhatsApp delivery alerts.",
    },
  },
  {
    id: 20,
    signal: "best ai contract lifecycle management and supplier compliance audit kenya",
    summary: "Searching for AI contract lifecycle management and supplier SLA compliance auditing.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Head of Procurement",
    company: "Western Sugar Mills",
    location: "Kakamega, Kenya\n201-500 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "AI supplier contract lifecycle management",
    score: 81,
    profile: "Kennedy Wekesa",
    reasons: [
      "Inbound search for enterprise contract compliance automation",
      "Large-scale agricultural processing plant with extensive vendor base",
      "Procurement lead looking to automate audit trails",
      "Recent search activity (Detected 10 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Selection",
    problem: "Unmonitored supplier contract expirations and missed SLA breach penalties",
    urgency: "Medium",
    entityType: "company",
    industry: "Manufacturing & Agro-Processing",
    keyTopics: ["Contract AI", "Supplier Compliance", "Procurement Automation"],
    competitors: ["Icertis", "Coupa", "Manual Filing Cabinets"],
    followUpStrategy: "Offer an automated contract audit scanning 50 legacy supplier agreements for hidden renewal dates.",
    postUrl: "https://www.google.com/search?q=best+ai+contract+lifecycle+management+kenya",
    suggestedMessage:
      "Hi Kennedy,\nProcurement teams in heavy agro-processing frequently lose capital when supplier contracts auto-renew without renegotiation. Our AI contract intelligence platform flags renewals and audits supplier compliance automatically.",
    recommendedAction: {
      title: "Offer 50-contract compliance audit trial",
      detail: "Scan legacy supplier contracts to identify auto-renewals and SLA breach penalties.",
    },
  },
  {
    id: 21,
    signal: "What is the fastest way to add Swahili speech-to-text into our customer service app in Kenya? Whisper vs Google Cloud Speech pricing comparison?",
    summary: "Comparing pricing and latency for Swahili speech-to-text integration in customer apps.",
    source: "Reddit Post",
    sourceIcon: "r",
    persona: "Lead Developer",
    company: "Individual",
    location: "Nakuru, Kenya",
    intent: "Price",
    intentColor: "#67b7f4",
    description: "Swahili speech-to-text benchmark & cost",
    score: 75,
    profile: "Daniel Kiprotich",
    reasons: [
      "Developer researching voice STT costs for customer support",
      "Evaluating cloud API costs vs self-hosted Whisper",
      "Recent activity (Posted 10 hours ago)",
    ],
    signalType: "Price",
    buyingStage: "Research",
    problem: "High cloud API bills for voice transcription in African dialects",
    urgency: "Low-Medium",
    entityType: "individual",
    industry: "Software & Mobile Apps",
    keyTopics: ["Swahili STT", "Speech Recognition", "Cloud Costs"],
    competitors: ["Google Cloud STT", "OpenAI Whisper", "Deepgram"],
    followUpStrategy: "Send open-source self-hosted Whisper benchmark for East African dialects.",
    postUrl: "https://www.reddit.com/r/Kenya/",
    suggestedMessage:
      "Hi Daniel,\nTranscribing Swahili at scale using generic US cloud APIs gets expensive very quickly. We can share benchmark latency and cost numbers comparing fine-tuned local models against proprietary cloud APIs.",
    recommendedAction: {
      title: "Send Swahili STT latency & cost comparison",
      detail: "Compare open fine-tuned models against commercial cloud APIs for voice triage.",
    },
  },
  {
    id: 22,
    signal: "Hiring 6 new B2B sales development reps in Nairobi. We need an AI sales coaching tool that reviews sales call recordings and scores objection handling on East African financial products.",
    summary: "Seeking an AI sales coaching platform to analyze SDR calls and regional financial objection handling.",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Head of Marketing & Sales",
    company: "Apex Financial Advisory",
    location: "Nairobi (Upper Hill), Kenya\n20-50 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "AI sales call coaching for local financial products",
    score: 91,
    profile: "Phyllis Kerubo",
    reasons: [
      "Sales expansion creating urgent onboarding and training need",
      "Sales leader actively looking for call intelligence software",
      "Dedicated commercial budget allocated for rep enablement",
      "Recent activity (Posted 11 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Purchase Planning",
    problem: "Long ramp time for junior SDRs pitching complex commercial wealth products",
    urgency: "High",
    entityType: "company",
    industry: "Wealth Management & Advisory",
    keyTopics: ["AI Sales Coaching", "Conversation Intelligence", "SDR Enablement"],
    competitors: ["Gong.io", "Chorus", "Manual Call Shadowing"],
    followUpStrategy: "Share our localized objection-handling scorecard fine-tuned on corporate banking sales in East Africa.",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi Phyllis,\nOnboarding new SDRs in Nairobi without standardized call coaching leads to months of missed quotas. Our sales intelligence platform automatically analyzes call recordings, highlights objection patterns, and boosts rep productivity in weeks.",
    recommendedAction: {
      title: "Deliver localized objection-handling scorecard",
      detail: "Share AI sales coaching templates tuned to East African commercial banking sales.",
    },
  },
  {
    id: 23,
    signal: "ai workflow automation core banking migration kenya",
    summary: "Searching for AI workflow automation and ledger data cleansing for core banking migration.",
    source: "Google Search",
    sourceIcon: "G",
    persona: "Head of Digital Transformation",
    company: "Metropolitan Sacco",
    location: "Nairobi (CBD), Kenya\n201-500 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "Core banking AI automation & data migration",
    score: 95,
    profile: "Anthony Macharia",
    reasons: [
      "Highest intent score (95%) tied to complex core banking upgrade",
      "Executive transformation lead looking for automated verification",
      "Critical compliance and balance reconciliation exposure",
      "Recent search activity (Detected 11 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Partner Selection",
    problem: "Data migration errors and manual reconciliation during core banking upgrade",
    urgency: "High",
    entityType: "company",
    industry: "Banking & Financial Cooperatives",
    keyTopics: ["Core Banking Migration", "AI Data Cleansing", "SACCO Transformation"],
    competitors: ["Oracle Flexcube", "Temenos", "Local Systems Integrators"],
    followUpStrategy: "Schedule executive consultation demonstrating automated data cleansing and balance verification.",
    postUrl: "https://www.google.com/search?q=ai+workflow+automation+core+banking+kenya",
    suggestedMessage:
      "Hi Anthony,\nCore banking migrations carry tremendous risk of corrupted legacy records and member transaction discrepancies. Our automated reconciliation agents validate every ledger balance before and after migration cutover.",
    recommendedAction: {
      title: "Schedule core banking migration audit briefing",
      detail: "Walk through automated balance verification and ledger integrity checks.",
    },
  },
  {
    id: 24,
    signal: "Motor insurance claim fraud is eating our underwriting margins. Need an AI image damage assessment tool that works reliably on photos taken with budget Android phones.",
    summary: "Seeking mobile computer vision AI for vehicle damage assessment and fraud detection.",
    source: "X/Twitter Post",
    sourceIcon: "X",
    persona: "Chief Technology Officer",
    company: "Zuri InsurTech",
    location: "Nairobi (Westlands), Kenya\n20-50 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "AI vehicle damage estimation & fraud detection",
    score: 89,
    profile: "Gladys Akinyi",
    reasons: [
      "Direct margin erosion from manual claims leakage",
      "CTO actively seeking vision model tailored to mobile photos",
      "High fit for automated damage classification build",
      "Recent activity (Posted 12 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Vendor Selection",
    problem: "Fraudulent repair estimates and delayed claim turnaround times",
    urgency: "High",
    entityType: "company",
    industry: "Insurtech & Underwriting",
    keyTopics: ["Insurtech AI", "Damage Assessment", "Fraud Detection"],
    competitors: ["Tractable", "Manual Claims Adjusters"],
    followUpStrategy: "Provide live sandbox test assessing typical vehicle scratch and bumper damage photos.",
    postUrl: "https://x.com/search?q=ai+motor+insurance+claims+kenya",
    suggestedMessage:
      "Hi Gladys,\nDetecting claim fraud while speeding up legitimate settlements is crucial for underwriting profitability. Our computer vision models evaluate vehicle damage severity instantly from everyday smartphone photos.",
    recommendedAction: {
      title: "Provide mobile damage assessment sandbox",
      detail: "Test vehicle scratch and dent classification directly on smartphone photographs.",
    },
  },
  {
    id: 25,
    signal: "What is the average agency fee in Kenya for deploying automated AI outbound lead generation campaigns?",
    summary: "Benchmarking Kenyan agency fees for automated AI outbound lead generation campaigns.",
    source: "Reddit Post",
    sourceIcon: "r",
    persona: "Growth Lead",
    company: "Individual",
    location: "Eldoret, Kenya",
    intent: "Price",
    intentColor: "#67b7f4",
    description: "AI outbound agency fee comparison",
    score: 78,
    profile: "Erick Ngetich",
    reasons: [
      "Active buyer seeking pricing clarity in Kenyan market",
      "Evaluating outsourced agency vs self-serve outbound platform",
      "Clear intent to launch outbound campaign this quarter",
      "Recent activity (Posted 12 hours ago)",
    ],
    signalType: "Price",
    buyingStage: "Budgeting",
    problem: "Opaque retainers and unverified lead counts from local marketing agencies",
    urgency: "Medium",
    entityType: "individual",
    industry: "B2B Professional Services",
    keyTopics: ["Outbound Pricing", "Lead Generation ROI", "Agency Retainers"],
    competitors: ["Traditional PR Agencies", "Freelance Marketers"],
    followUpStrategy: "Share our transparent B2B lead generation cost per qualified meeting model.",
    postUrl: "https://www.reddit.com/r/Kenya/",
    suggestedMessage:
      "Hi Erick,\nMany agencies in Kenya bill high monthly retainers without guaranteeing pipeline outcomes. We can share transparent benchmarks for cost-per-qualified B2B lead so you know exactly what to budget.",
    recommendedAction: {
      title: "Send transparent B2B lead generation pricing guide",
      detail: "Share cost-per-qualified meeting benchmarks for Kenyan commercial outreach.",
    },
  },
];

const sourceFilterOptions: SelectOption[] = [
  { value: "all", label: "All Sources" },
  { value: "LinkedIn Post", label: "LinkedIn Post" },
  { value: "X/Twitter Post", label: "X/Twitter Post" },
  { value: "Reddit Post", label: "Reddit Post" },
  { value: "Google Search", label: "Google Search" },
];

const signalTypeFilterOptions: SelectOption[] = [
  { value: "all", label: "All Signal Type" },
  { value: "Recommendation", label: "Recommendation" },
  { value: "Switching", label: "Switching" },
  { value: "Price", label: "Price" },
];

const intentFilterOptions: SelectOption[] = [
  { value: "all", label: "All Intent" },
  { value: "Consideration", label: "Consideration" },
  { value: "Vendor Evaluation", label: "Vendor Evaluation" },
  { value: "Research", label: "Research" },
];

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    body:
      "Welcome to Sales Engine.\n\nI'm your AI-powered assistant built to help you discover high-quality leads, craft personalized outreach messages, and develop smart follow-up strategies that improve response rates.\n\nWhether you're looking to identify companies in a specific industry, refine your targeting, write compelling sales emails, or understand why certain leads aren't responding, I'm here to guide you through the process step by step.\n\nYou can ask me to generate new leads, analyze your outreach performance, suggest improvements, or create follow-up messages based on engagement activity. The more details you provide about your target audience, location, or offer, the more precise and effective my recommendations will be.\n\nLet's start building smarter outreach.\n\nWhat would you like to work on today?",
  },
];

function MetricCard({
  title,
  value,
  percent,
  active = false,
  unit = "Leads",
}: {
  title: string;
  value: string;
  percent: string;
  active?: boolean;
  unit?: string;
}) {
  return (
    <section
      className={`relative h-[126px] overflow-hidden rounded-[15px] border border-[rgba(179,179,179,0.2)] px-5 py-3 shadow-[0_1px_3px_1px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] ${
        active ? "bg-[#0b242e] text-white" : "bg-white text-[#0b242e]"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-[14px] font-light leading-[19px] ${active ? "text-white" : "text-[#293e46]"}`}>
          {title}
        </p>
        {/* <MoreVertical size={15} className={active ? "text-white/45" : "text-[#09232d]/40"} /> */}
      </div>

      <div className="absolute left-5 top-[48px]">
        <div className="flex items-end gap-1">
          <p className="text-[32px] font-semibold leading-[43px]">{value}</p>
          <p className={`pb-2 text-[9px] font-semibold ${active ? "text-white" : "text-[#0b242e]"}`}>
            {unit}
          </p>
        </div>
        <p className={`mt-[-4px] text-[8px] leading-[16px] ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {percent}% increase this week
        </p>
      </div>

      <div className="absolute right-[17px] top-[19px] grid size-[108px] place-items-center">
        <div
          className={`sales-gauge-spin absolute size-[84px] rounded-full border-[7px] ${
            active ? "border-[#3E7210]" : "border-[#ff604c]"
          } border-l-transparent rotate-[-24deg]`}
        />
        <div className={`absolute size-[49px] rounded-full ${active ? "bg-[#14343e]" : "bg-[#f9f9f9]"}`} />
        <p className={`relative text-[8px] font-semibold ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {percent}%
        </p>
      </div>
    </section>
  );
}

function TrendChart() {
  return (
    <section className="relative h-[126px] min-w-[420px] flex-1 overflow-visible px-1 pt-1 max-lg:min-w-0">
      <div className="grid grid-cols-6 text-[13px] font-medium text-[#09232d]/50">
        {weekDays.map((day) => (
          <span key={day} className="text-center">
            {day}
          </span>
        ))}
      </div>
      <div className="relative mt-4 h-[92px]">
        <div className="absolute inset-x-5 top-0 bottom-2 grid grid-cols-6">
          {weekDays.map((day, index) => (
            <div key={day} className="relative">
              <span
                className={`absolute left-1/2 top-0 h-full border-l border-dashed ${
                  index === 4 ? "border-[#fd6046]" : "border-[#6b9bb0]"
                }`}
              />
            </div>
          ))}
        </div>
        <svg viewBox="0 0 430 112" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="sales-trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fd6046" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#fd6046" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84"
            fill="none"
            stroke="#fd6046"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84 L430 112 L0 112 Z"
            fill="url(#sales-trend-fill)"
          />
          <path d="M318 83 H382" stroke="#fd6046" strokeDasharray="6 6" strokeLinecap="round" />
        </svg>
        <div className="absolute right-4 top-[18px] flex h-5 items-center gap-1 rounded-[12px] border border-[#e4e4e9] bg-white px-2.5 shadow-[0_12px_17px_rgba(11,36,46,0.15)]">
          <span className="text-[11px] font-medium text-[#fd6046]">+27%</span>
          <span className="text-[10px] text-[#09232d]/70">Performance higher this week</span>
        </div>
      </div>
    </section>
  );
}

function IntentModeChip({
  intent,
  onClear,
  compact = false,
}: {
  intent: ActionIntent;
  onClear?: () => void;
  compact?: boolean;
}) {
  const mode = INTENT_MODE_CONFIG[intent];

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${mode.chipTint} ${
        compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]"
      }`}
    >
      {mode.icon}
      <span className="truncate">{mode.label}</span>
      {onClear && (
        <button
          type="button"
          aria-label={`Clear ${mode.label} mode`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClear();
          }}
          className="ml-0.5 grid size-4 shrink-0 place-items-center rounded-full transition hover:bg-black/10"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function PromptButton({
  icon,
  label,
  tint,
  active = false,
  onSelect,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  tint: string;
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      disabled={disabled}
      aria-pressed={active}
      className={`flex h-[32px] items-center gap-2 rounded-[18px] border px-4 text-[9px] font-medium text-[#09232d] shadow-[0_1px_2px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-50 ${tint} ${
        active ? "border-[#09232d] ring-2 ring-[#09232d]/20" : "border-black/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ThinkingBubble({ stage }: { stage: string }) {
  return (
    <div className="max-w-[430px] rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      <div className="flex items-center gap-3">
        <div className="relative grid size-8 place-items-center rounded-full bg-[#09232d] text-white">
          <Sparkles size={14} className="animate-pulse" />
          <span className="absolute inset-[-4px] rounded-full border border-[#16b37d]/40 animate-ping" />
        </div>
        <div className="min-w-0">
          <p key={stage} className="animate-in fade-in slide-in-from-bottom-1 text-[11px] font-semibold duration-300">
            {stage}
          </p>
          <div className="mt-1.5 flex gap-1">
            <span className="h-1.5 w-8 animate-pulse rounded-full bg-[#16b37d]" />
            <span className="h-1.5 w-5 animate-pulse rounded-full bg-[#16b37d]/60 [animation-delay:150ms]" />
            <span className="h-1.5 w-3 animate-pulse rounded-full bg-[#16b37d]/30 [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadInlineResults({ leads }: { leads: ChatLead[] }) {
  return (
    <div className="mt-3 grid max-w-[640px] gap-2 sm:grid-cols-3">
      {leads.map((lead) => (
        <div key={lead.id ?? lead.name} className="rounded-[14px] border border-[#09232d]/10 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-bold text-[#09232d]">{lead.name}</p>
            <span className="shrink-0 rounded-full bg-[#16b37d]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#087652]">
              {lead.score}
            </span>
          </div>
          <p className="mt-1 text-[8px] text-[#09232d]/50">{lead.source}</p>
          <p className="mt-1 line-clamp-2 text-[8px] leading-[10px] text-[#09232d]/65">{lead.summary}</p>
        </div>
      ))}
    </div>
  );
}

function ChatWorkspace({
  expanded,
  onToggleExpanded,
  onOpenIcpBuilder,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenIcpBuilder: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent>("freeform");
  const [thinkingStage, setThinkingStage] = useState<string>(thinkingStagesByIntent.freeform[0]);
  const [isIcpMenuOpen, setIsIcpMenuOpen] = useState(false);
  const [icpMenuPosition, setIcpMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const transcriptRef = useRef<HTMLDivElement>(null);
  const thinkingIntervalRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Local React keys for messages — independent of the API's session-scoped message
  // ids, which restart from 1 per session and would collide with the hardcoded
  // welcome message (id: 1).
  const nextMessageIdRef = useRef(2);
  function nextMessageId() {
    return nextMessageIdRef.current++;
  }
  const icpMenuRef = useRef<HTMLDivElement>(null);
  const icpTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: icpProfiles = [], isLoading: isIcpProfilesLoading } = useIcpProfiles();
  const activateIcpProfile = useActivateIcpProfile({
    onSuccess: (profile) => toast.success(`Switched active ICP to "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to switch ICP build.")),
  });

  useLayoutEffect(() => {
    if (!isIcpMenuOpen || !icpTriggerRef.current) return;
    const rect = icpTriggerRef.current.getBoundingClientRect();
    setIcpMenuPosition({ top: rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 260) });
  }, [isIcpMenuOpen]);

  useEffect(() => {
    if (!isIcpMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        icpMenuRef.current &&
        !icpMenuRef.current.contains(target) &&
        icpTriggerRef.current &&
        !icpTriggerRef.current.contains(target)
      ) {
        setIsIcpMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIcpMenuOpen]);

  const sendMessage = useSendChatMessage({
    onSuccess: ({ assistant_message }) => {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          body: assistant_message.body,
          leads: assistant_message.leads ?? undefined,
        },
      ]);
    },
    onError: (error) => {
      toast.error(
        isMissingActiveIcp(error)
          ? "Select an active ICP profile first — open ICP Builder to create or activate one."
          : getApiErrorMessage(error, "Sales Engine couldn't process that request.")
      );
    },
  });
  const isThinking = sendMessage.isPending;

  function stopThinkingCycle() {
    if (thinkingIntervalRef.current != null) {
      window.clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function startThinkingCycle(intent: ChatIntent) {
    const stages = thinkingStagesByIntent[intent];
    let stageIndex = 0;
    setThinkingStage(stages[0]);
    stopThinkingCycle();
    thinkingIntervalRef.current = window.setInterval(() => {
      stageIndex = (stageIndex + 1) % stages.length;
      setThinkingStage(stages[stageIndex]);
    }, 1200);
  }

  function selectIntent(intent: ActionIntent) {
    setSelectedIntent((current) => (current === intent ? "freeform" : intent));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearIntent() {
    setSelectedIntent("freeform");
    inputRef.current?.focus();
  }

  function handleSend(prompt: string, intent: ChatIntent = selectedIntent) {
    const trimmed = prompt.trim();
    if (!trimmed || isThinking) return;

    setMessages((current) => [
      ...current,
      { id: nextMessageId(), role: "user", body: trimmed, intent },
    ]);
    setDraft("");
    startThinkingCycle(intent);

    sendMessage.mutate(
      { body: trimmed, intent },
      { onSettled: () => stopThinkingCycle() }
    );
  }

  function scrollTranscriptToBottom() {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    if (messages.length === 1 && !isThinking) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTranscriptToBottom();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isThinking, thinkingStage]);

  useEffect(() => () => stopThinkingCycle(), []);

  return (
    <section
      className={`relative flex flex-col overflow-hidden rounded-[35px] bg-white shadow-[0_8px_6px_rgba(0,0,0,0.15),0_4px_2px_rgba(0,0,0,0.3)] transition-[height] duration-300 ${
        expanded ? "h-[calc(100vh-112px)] min-h-[720px]" : "h-[600px]"
      }`}
    >
      <header className="mx-6 mt-5 flex h-[48px] shrink-0 items-center justify-between rounded-[24px] bg-[#09232d] px-6 text-white shadow-[0_6px_6px_rgba(0,0,0,0.18)] max-sm:mx-4">
        <button
          ref={icpTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isIcpMenuOpen}
          onClick={() => setIsIcpMenuOpen((current) => !current)}
          className="flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-white/10"
        >
          <Sparkles size={18} className="shrink-0" />
          <span className="max-w-[220px] truncate text-[21px] font-semibold">
            {icpProfiles.find((profile) => profile.isActive)?.name ?? "Sales Engine"}
          </span>
          <ChevronDown
            size={14}
            className={`text-white/50 transition-transform ${isIcpMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          aria-label={expanded ? "Minimize Sales Engine" : "Expand Sales Engine"}
          onClick={onToggleExpanded}
          className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
        </button>
      </header>

      {isIcpMenuOpen &&
        icpMenuPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={icpMenuRef}
            role="menu"
            style={{ top: icpMenuPosition.top, left: icpMenuPosition.left, width: icpMenuPosition.width }}
            className="fixed z-50 max-h-[320px] overflow-y-auto rounded-[16px] border border-black/5 bg-white p-1.5 text-[#09232d] shadow-[0_16px_32px_rgba(9,35,45,0.18)]"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              ICP Builds
            </p>
            {isIcpProfilesLoading && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">Loading…</p>
            )}
            {!isIcpProfilesLoading && icpProfiles.length === 0 && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">No ICP builds yet.</p>
            )}
            {icpProfiles.map((profile) => {
              const isSwitchingToThis = activateIcpProfile.isPending && activateIcpProfile.variables === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={profile.isActive}
                  disabled={activateIcpProfile.isPending}
                  onClick={() => {
                    if (profile.isActive) {
                      setIsIcpMenuOpen(false);
                      return;
                    }
                    activateIcpProfile.mutate(profile.id, { onSuccess: () => setIsIcpMenuOpen(false) });
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] font-medium transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                    profile.isActive ? "bg-gray-100" : ""
                  }`}
                >
                  <span className="truncate">{profile.name}</span>
                  {isSwitchingToThis ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />
                  ) : (
                    profile.isActive && <Check size={14} className="shrink-0 text-[#16b37d]" />
                  )}
                </button>
              );
            })}
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsIcpMenuOpen(false);
                  onOpenIcpBuilder();
                }}
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] font-semibold text-[#09232d] transition hover:bg-gray-100"
              >
                Manage ICP Builds
              </button>
            </div>
          </div>,
          document.body
        )}

      <div
        ref={transcriptRef}
        className={`mx-auto mt-5 min-h-0 w-full flex-1 overflow-y-auto scroll-smooth px-6 pb-4 text-[#09232d] max-sm:px-4 ${
          expanded ? "max-w-[1100px]" : "max-w-[824px]"
        }`}
      >
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[78%]" : "max-w-full"}>
              {message.role === "user" && message.intent && message.intent !== "freeform" && (
                <div className="mb-1.5 flex justify-end">
                  <IntentModeChip intent={message.intent} compact />
                </div>
              )}
              <div
                className={
                  message.role === "user"
                    ? "rounded-[18px] bg-[#09232d] px-4 py-3 text-[12px] leading-[16px] text-white"
                    : index === 0
                      ? "text-[12px] leading-[15px] text-[#09232d]"
                      : "rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[12px] leading-[16px] text-[#09232d]"
                }
              >
                <ChatMessageBody
                  content={message.body}
                  variant={message.role === "user" ? "user" : index === 0 ? "welcome" : "assistant"}
                />
              </div>
              {message.leads && <LeadInlineResults leads={message.leads} />}
              {index === 0 && (
                <div className="mt-5 flex items-center gap-5 text-[#cfcfcf]">
                  <ThumbsUp size={14} />
                  <ThumbsDown size={14} />
                  <Copy size={14} />
                </div>
              )}
            </div>
          ))}
          {isThinking && <ThinkingBubble stage={thinkingStage} />}
          <div aria-hidden className="h-2" />
        </div>
      </div>

      <div
        className={`mx-auto mb-5 w-[calc(100%-88px)] shrink-0 rounded-[22px] border border-[#d7d7d7] bg-white shadow-sm max-sm:mb-4 max-sm:w-[calc(100%-32px)] ${
          expanded ? "max-w-[1100px]" : "max-w-[824px]"
        }`}
      >
        <div className="flex min-h-[43px] flex-wrap items-center gap-2 rounded-t-[22px] border-b border-[#ececec] px-5 py-1.5">
          <Plus size={21} className="shrink-0 text-[#09232d]" />
          {selectedIntent !== "freeform" && (
            <IntentModeChip intent={selectedIntent} onClear={clearIntent} />
          )}
          <input
            ref={inputRef}
            aria-label="Ask Sales Engine"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              if (draft.trim()) handleSend(draft, selectedIntent);
            }}
            className="h-8 min-w-[120px] flex-1 bg-transparent text-[10px] text-[#09232d] outline-none placeholder:text-[#b5b5b5]"
            placeholder={INTENT_PLACEHOLDERS[selectedIntent]}
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={() => handleSend(draft, selectedIntent)}
            disabled={isThinking || !draft.trim()}
            className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#09232d] text-white disabled:opacity-60"
          >
            <Send size={15} fill="currentColor" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
          <PromptButton
            icon={<Globe2 size={17} />}
            label="Quick Research"
            active={selectedIntent === "quick_research"}
            onSelect={() => selectIntent("quick_research")}
            tint={INTENT_MODE_CONFIG.quick_research.tint}
            disabled={isThinking}
          />
          <PromptButton
            icon={<UsersRound size={17} />}
            label="Generate New Leads"
            active={selectedIntent === "generate_leads"}
            onSelect={() => selectIntent("generate_leads")}
            tint={INTENT_MODE_CONFIG.generate_leads.tint}
            disabled={isThinking}
          />
          <PromptButton
            icon={<Lightbulb size={17} />}
            label="Create Outreach Message"
            active={selectedIntent === "create_outreach"}
            onSelect={() => selectIntent("create_outreach")}
            tint={INTENT_MODE_CONFIG.create_outreach.tint}
            disabled={isThinking}
          />
        </div>
      </div>
    </section>
  );
}

function OutreachCard({
  color,
  icon,
  iconColor,
  name,
  channel,
  preview,
  time,
}: {
  color: string;
  icon: string;
  iconColor?: string;
  name: string;
  channel: string;
  preview: string;
  time: string;
}) {
  return (
    <article
      className={`${color} h-[108px] rounded-[20px] p-5 shadow-[0_6px_5px_rgba(0,0,0,0.15),0_2px_1.5px_rgba(0,0,0,0.3)]`}
      style={color.startsWith("#") ? { backgroundColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
            <MessageCircle
              size={21}
              className={icon}
              style={iconColor ? { color: iconColor } : undefined}
              fill="currentColor"
            />
          </div>
          <div className="min-w-0 text-[#09232d]">
            <p className="text-[14px] font-bold leading-[18px]">{name}</p>
            <p className="mt-1 max-w-[156px] text-[7px] font-light leading-[9px]">
              {channel}: {preview}
            </p>
          </div>
        </div>
        <MoreVertical size={24} className="shrink-0 text-[#09232d]" />
      </div>
      <p className="ml-[88px] mt-2 text-[5px] font-light leading-[9px] text-[#09232d]">{time}</p>
    </article>
  );
}
const OUTREACH_FALLBACK_COLORS = [
  { color: "bg-[#df93e6]", icon: "text-[#9d25a8]" },
  { color: "bg-[#8dc8c8]", icon: "text-[#6ab6b7]" },
  { color: "bg-[#dbdbdb]", icon: "text-[#cfcfcf]" },
  { color: "bg-[#f79787]", icon: "text-[#ef735f]" },
] as const;

function ViewAllOutreachIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4.66797 9.33341L6.5299 7.47148C6.79024 7.21115 7.21237 7.21115 7.4727 7.47148L8.5299 8.52868C8.79024 8.78901 9.21237 8.78901 9.4727 8.52868L11.3346 6.66675" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.9995 8.66667C14 8.4536 14 8.23153 14 8C14 5.17157 14 3.75736 13.1213 2.87868C12.2427 2 10.8284 2 8 2C5.17157 2 3.75736 2 2.87868 2.87868C2 3.75736 2 5.17157 2 8C2 10.8284 2 12.2427 2.87868 13.1213C3.75736 14 5.17157 14 8 14C8.23153 14 8.4536 14 8.66667 13.9995" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12.6505 10.6811C12.6543 10.662 12.6817 10.662 12.6855 10.6811C12.8881 11.6722 13.6626 12.4466 14.6537 12.6492C14.6728 12.6531 14.6728 12.6804 14.6537 12.6843C13.6626 12.8869 12.8881 13.6614 12.6855 14.6524C12.6817 14.6716 12.6543 14.6716 12.6505 14.6524C12.4479 13.6614 11.6734 12.8869 10.6823 12.6843C10.6632 12.6804 10.6632 12.6531 10.6823 12.6492C11.6734 12.4466 12.4479 11.6722 12.6505 10.6811Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function AllOutreachModal({
  isOpen,
  onClose,
  items,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: Array<{
    id: number;
    name: string;
    channel: string;
    preview: string;
    occurred_at: string;
    accentBg?: string;
    accentIcon?: string;
  }>;
}) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.channel.toLowerCase().includes(q) ||
        item.preview.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ type: "spring", duration: 0.32 }}
            className="relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#09232d] text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Smart Lead
                </p>
                <h3 className="mt-1 text-[18px] font-semibold">All Outreach Activities</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-white/10 px-6 py-3">
              <label className="flex h-9 w-full items-center gap-2 rounded-full bg-white/5 px-3.5 text-white">
                <Search size={14} className="text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search activities by recipient, channel, or message…"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/40"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-white/40 hover:text-white cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {filteredItems.length === 0 ? (
                <div className="flex h-[200px] flex-col items-center justify-center text-center text-white/50 text-[13px]">
                  No outreach activities found.
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const fallback = OUTREACH_FALLBACK_COLORS[index % OUTREACH_FALLBACK_COLORS.length];
                  const useApiColors = item.accentBg?.startsWith("#");
                  return (
                    <OutreachCard
                      key={item.id}
                      color={useApiColors ? item.accentBg! : fallback.color}
                      icon={useApiColors ? "" : fallback.icon}
                      iconColor={useApiColors ? item.accentIcon : undefined}
                      name={item.name}
                      channel={item.channel}
                      preview={item.preview}
                      time={formatRelativeTime(item.occurred_at)}
                    />
                  );
                })
              )}
            </div>

            <div className="flex justify-end border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-[12px] bg-white/10 px-5 text-[12px] font-semibold text-white transition hover:bg-white/15 cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function OutreachPanel() {
  const { data: items = [] } = useSalesEngineOutreach();
  const [isAllOutreachOpen, setIsAllOutreachOpen] = useState(false);

  return (
    <>
      <aside className="ticket-cutout relative h-[600px] overflow-hidden rounded-[20px] bg-[#09232d] px-[36px] py-[33px] text-white shadow-sm max-xl:h-[520px] max-sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold leading-tight">Recent Outreach Activities</h2>
          <button
            type="button"
            onClick={() => setIsAllOutreachOpen(true)}
            className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-[12px] bg-white px-3 text-[12px] font-bold text-[#09232d] shadow-sm transition hover:bg-gray-100 cursor-pointer"
          >
            <ViewAllOutreachIcon className="size-4 text-[#09232d]" />
            <span>View All</span>
          </button>
        </header>
      {items.length > 0 ? (
        <>
          <div className="absolute right-[22px] top-[97px] h-[18px] w-[3px] rounded-full bg-[#e5e5e5]" />
          <div className="mx-auto flex h-[480px] max-w-[285px] flex-col gap-4 overflow-y-auto pr-2 max-xl:h-[400px]">
            {items.map((item, index) => {
              const fallback = OUTREACH_FALLBACK_COLORS[index % OUTREACH_FALLBACK_COLORS.length];
              const useApiColors = item.accentBg?.startsWith("#");
              return (
                <OutreachCard
                  key={item.id}
                  color={useApiColors ? item.accentBg : fallback.color}
                  icon={useApiColors ? "" : fallback.icon}
                  iconColor={useApiColors ? item.accentIcon : undefined}
                  name={item.name}
                  channel={item.channel}
                  preview={item.preview}
                  time={formatRelativeTime(item.occurred_at)}
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex h-[460px] flex-col items-center justify-center max-xl:h-[380px]">
          <Image
            src="/message_empty.png"
            alt="No recent outreach activities"
            width={209}
            height={201}
            className="h-auto w-[180px] max-w-full select-none object-contain"
            priority
          />
        </div>
      )}
    </aside>
    <AllOutreachModal
      isOpen={isAllOutreachOpen}
      onClose={() => setIsAllOutreachOpen(false)}
      items={items}
    />
  </>
  );
}

function PipelineGaugeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M7 16a5.5 5.5 0 1 1 10 0" />
      <path d="M12 12.5l-2.5-2.5" />
      <circle cx="12" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IcpBuilderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13.5 3.5H7.5A4 4 0 0 0 3.5 7.5v9A4 4 0 0 0 7.5 20.5h9a4 4 0 0 0 4-4v-6" />
      <circle cx="10.5" cy="10" r="2.5" />
      <path d="M6.5 17.5c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path
        d="M18.5 2.5c0 1.6 1.4 2.8 3 2.8-1.6 0-3 1.2-3 2.8 0-1.6-1.4-2.8-3-2.8 1.6 0 3-1.2 3-2.8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function CompanyBuildingIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 21h18" />
      <path d="M5 21V7a4 4 0 0 1 4-4h5v18" />
      <path d="M8 8h3" />
      <path d="M8 12h3" />
      <path d="M8 16h3" />
      <path d="M14 9h5a1 1 0 0 1 1 1v11" />
      <path d="M17 14v4" />
    </svg>
  );
}

function SalesEngineTabs({
  activeTab,
  onChange,
}: {
  activeTab: SalesEngineTab;
  onChange: (tab: SalesEngineTab) => void;
}) {
  return (
    <div className="flex">
      <div className="inline-flex h-[42px] items-center gap-1 rounded-[21px] bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        {salesEngineTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`h-[32px] rounded-[17px] px-5 text-[12px] font-semibold transition ${
              activeTab === tab.id
                ? "bg-[#09232d] text-white shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                : "bg-transparent text-[#9d9d9d] hover:text-[#09232d]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SourceBadge({ sourceIcon }: { sourceIcon: string }) {
  const isLinkedIn = sourceIcon === "in";
  const isReddit = sourceIcon === "r";
  const isGoogle = sourceIcon === "G" || sourceIcon.toLowerCase() === "google";

  if (isGoogle) {
    return (
      <span
        aria-label="Google Search"
        className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-white text-[11px] font-bold shadow-sm border border-gray-200"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`grid size-[22px] shrink-0 place-items-center rounded-[6px] text-[10px] font-bold text-white shadow-sm ${
        isLinkedIn ? "bg-[#0a66c2]" : isReddit ? "bg-[#ff4500]" : "bg-black"
      }`}
    >
      {sourceIcon}
    </span>
  );
}

function ScoreGauge({ score, dark = false }: { score: number; dark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative grid size-[43px] place-items-center">
        <span
          className={`sales-gauge-spin absolute inset-0 rounded-full border-[4px] border-[#3E7210] border-l-transparent rotate-[-35deg] ${
            dark ? "bg-[#153841]" : "bg-white"
          }`}
        />
        <span
          className={`absolute inset-[7px] rounded-full ${dark ? "bg-[#3E7210]" : "bg-white"}`}
        />
        <span className={`relative text-[9px] font-semibold ${dark ? "text-white" : "text-[#09232d]"}`}>{score}%</span>
      </div>
      <span className={`text-[9px] ${dark ? "text-white/80" : "text-[#616263]"}`}>High</span>
    </div>
  );
}

function SignalActionMenu({
  signal,
  isActive = false,
  onRemove,
  onSelect,
}: {
  signal: SocialSignal;
  isActive?: boolean;
  onRemove?: (id: number) => void;
  onSelect?: (signal: SocialSignal) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 150;
    const menuHeight = 155;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    const left = Math.max(12, rect.right - menuWidth);
    setPosition({ top, left });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    function handleScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Signal actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(signal);
          setIsOpen((prev) => !prev);
        }}
        className={`grid size-6 place-items-center rounded-full transition cursor-pointer ${
          isActive
            ? "hover:bg-white/20 text-white"
            : "hover:bg-black/10 text-[#616263]"
        } ${isOpen ? (isActive ? "bg-white/20" : "bg-black/10") : ""}`}
      >
        <MoreVertical
          size={16}
          className={`transition-colors ${isActive ? "text-white" : "text-[#616263]"}`}
        />
      </button>

      {isOpen &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-[150px] rounded-[14px] border border-black/10 bg-white p-1.5 text-[#09232d] shadow-[0_12px_28px_rgba(9,35,45,0.18)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                toast.success(`Opening outreach composer for ${signal.company} (${signal.profile})…`);
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Send size={13} className="shrink-0 text-[#09232d]" />
              <span>Outreach</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                toast.success(`Added ${signal.company} to CRM pipeline.`);
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <UserPlus size={13} className="shrink-0 text-[#09232d]" />
              <span>Add to CRM</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                toast.success(`Reminder set for ${signal.company}.`);
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Clock size={13} className="shrink-0 text-[#09232d]" />
              <span>Set Reminder</span>
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onRemove?.(signal.id);
                toast.success(`Signal from ${signal.company} removed.`);
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-red-600 transition hover:bg-red-50 cursor-pointer"
            >
              <Trash2 size={13} className="shrink-0 text-red-500" />
              <span>Remove</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function SocialSignalRow({
  signal,
  isActive = false,
  onSelect,
  onRemoveSignal,
}: {
  signal: SocialSignal;
  isActive?: boolean;
  onSelect: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
}) {
  const isIndividual = signal.entityType === "individual" || signal.company.toLowerCase() === "individual";

  return (
    <tr
      onClick={() => onSelect(signal)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(signal);
        }
      }}
      className={`cursor-pointer outline-none transition-colors duration-150 ${
        isActive
          ? "bg-[#09232d] text-white"
          : "bg-[#f4f4f4] text-[#616263] hover:bg-[#eaeaea] hover:text-[#09232d]"
      }`}
    >
      <td className="rounded-l-[20px] px-4 py-3">
        <div className="flex min-w-[230px] gap-3">
          <SourceBadge sourceIcon={signal.sourceIcon} />
          <p
            className={`line-clamp-4 text-[9px] leading-[11px] transition-colors ${
              isActive ? "text-white" : "text-[#616263]"
            }`}
          >
            {signal.signal}
          </p>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="w-[64px] text-[8px] leading-[11px]">{signal.source}</p>
        <p
          className={`mt-1 text-[8px] transition-colors ${
            isActive ? "text-white/70" : "text-[#616263]/70"
          }`}
        >
          2hr ago
        </p>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="w-[68px] text-[8px] leading-[11px]">{signal.persona}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-[150px] items-center gap-2">
          {isIndividual ? (
            <User
              size={20}
              className={`shrink-0 transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            />
          ) : (
            <CompanyBuildingIcon
              className={`size-5 shrink-0 transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            />
          )}
          <div>
            <p className="text-[9px] font-semibold leading-[11px]">{signal.company}</p>
            {signal.location && (
              <p className="whitespace-pre-line text-[8px] leading-[10px] opacity-80">{signal.location}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <span
          className="inline-flex rounded-full px-3 py-1 text-[8px] font-semibold text-white"
          style={{ backgroundColor: signal.intentColor }}
        >
          {signal.intent}
        </span>
        <p className="mt-1 w-[92px] text-[8px] leading-[10px] opacity-80">{signal.description}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <ScoreGauge score={signal.score} dark={isActive} />
      </td>
      <td className="rounded-r-[20px] px-4 py-3 align-middle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={`Message ${signal.profile || signal.company}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(signal);
              toast.info(`Opening message composer for ${signal.profile || signal.company}…`);
            }}
            className={`grid size-6 place-items-center rounded-full transition cursor-pointer ${
              isActive ? "hover:bg-white/20" : "hover:bg-black/10"
            }`}
          >
            <MessageCircle
              size={15}
              className={`transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            />
          </button>
          <SignalActionMenu
            signal={signal}
            isActive={isActive}
            onRemove={onRemoveSignal}
            onSelect={onSelect}
          />
        </div>
      </td>
    </tr>
  );
}

const SIGNALS_PAGE_SIZE = 10;

function SocialSignalsTable({
  signals,
  activeSignalId,
  onSelectSignal,
  onRemoveSignal,
}: {
  signals: SocialSignal[];
  activeSignalId?: number;
  onSelectSignal: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [prevSignals, setPrevSignals] = useState(signals);
  if (signals !== prevSignals) {
    setPrevSignals(signals);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(signals.length / SIGNALS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * SIGNALS_PAGE_SIZE;
  const paginatedSignals = useMemo(() => {
    return signals.slice(startIndex, startIndex + SIGNALS_PAGE_SIZE);
  }, [signals, startIndex]);

  const startDisplay = signals.length === 0 ? 0 : startIndex + 1;
  const endDisplay = Math.min(startIndex + SIGNALS_PAGE_SIZE, signals.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safePage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }
    if (safePage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", safePage, "...", totalPages];
  }, [safePage, totalPages]);

  return (
    <section className="flex flex-1 min-h-0 flex-col rounded-[30px] bg-white p-2 shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)] overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1.5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 hover:[&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar:horizontal]:hidden [scrollbar-width:thin] [scrollbar-color:#e5e7eb_transparent]">
        <table className="w-full min-w-0 border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[9px] font-semibold text-[#333333]">
              <th className="bg-white px-4 py-1 text-left">Signal</th>
              <th className="bg-white px-3 py-1 text-left">Source</th>
              <th className="bg-white px-3 py-1 text-left">Persona</th>
              <th className="bg-white px-3 py-1 text-left">Company</th>
              <th className="bg-white px-3 py-1 text-left">Intent</th>
              <th className="bg-white px-3 py-1 text-center">Score</th>
              <th className="bg-white px-4 py-1 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSignals.map((signal) => (
              <SocialSignalRow
                key={signal.id}
                signal={signal}
                isActive={signal.id === activeSignalId}
                onSelect={onSelectSignal}
                onRemoveSignal={onRemoveSignal}
              />
            ))}
          </tbody>
        </table>
        {signals.length === 0 && (
          <div className="flex h-[220px] items-center justify-center text-[12px] font-medium text-[#616263]">
            No matching signals found.
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center justify-between border-t border-[#f1f1f1] px-8 pb-3 pt-3 text-[9px] font-semibold text-[#333333] max-sm:px-3">
        <span>Showing {startDisplay} - {endDisplay} of {signals.length} Signals</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className={`px-2 transition ${
              safePage <= 1
                ? "text-[#c1c1c1] cursor-not-allowed"
                : "text-[#333333] hover:text-[#09232d] cursor-pointer"
            }`}
          >
            Prev
          </button>
          {pageNumbers.map((page, idx) =>
            typeof page === "number" ? (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`grid size-8 place-items-center rounded-[8px] border text-[10px] font-medium transition cursor-pointer ${
                  safePage === page
                    ? "border-[#3f83f8] bg-[#3f83f8] text-white shadow-sm"
                    : "border-[#f1f1f1] bg-white text-[#333333] hover:bg-gray-100"
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={`ellipsis-${idx}`} className="px-1 text-[13px] text-gray-400">
                ...
              </span>
            )
          )}
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className={`px-2 transition ${
              safePage >= totalPages
                ? "text-[#c1c1c1] cursor-not-allowed"
                : "text-[#333333] hover:text-[#09232d] cursor-pointer"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function SocialListeningFilters({
  search,
  source,
  signalType,
  intent,
  isScanning,
  onSearchChange,
  onSourceChange,
  onSignalTypeChange,
  onIntentChange,
  onOpenSettings,
  onScan,
}: {
  search: string;
  source: string;
  signalType: string;
  intent: string;
  isScanning?: boolean;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSignalTypeChange: (value: string) => void;
  onIntentChange: (value: string) => void;
  onOpenSettings: () => void;
  onScan?: () => void;
}) {
  return (
    <div className="flex flex-nowrap items-center gap-2 xl:gap-2.5 overflow-x-auto py-1">
      <label className="flex h-9 w-[150px] xl:w-[170px] shrink-0 items-center gap-2 rounded-full bg-white px-3.5 shadow-[0_1px_3px_1px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.18)]">
        <Search size={14} className="shrink-0 text-[#09232d]" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[10px] text-[#09232d] outline-none placeholder:text-[#616263]"
          placeholder="Search"
        />
      </label>
      <SearchableSelect
        value={source}
        onChange={onSourceChange}
        options={sourceFilterOptions}
        className="h-8 min-w-[96px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <SearchableSelect
        value={signalType}
        onChange={onSignalTypeChange}
        options={signalTypeFilterOptions}
        className="h-8 min-w-[110px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <SearchableSelect
        value={intent}
        onChange={onIntentChange}
        options={intentFilterOptions}
        className="h-8 min-w-[90px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <button
        type="button"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c] transition-colors hover:bg-gray-100 cursor-pointer"
      >
        <SlidersHorizontal size={13} />
        Filter
      </button>
      <button
        type="button"
        onClick={onScan}
        disabled={isScanning}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] font-medium text-[#34373c] transition-colors hover:bg-gray-100 disabled:opacity-60 cursor-pointer"
      >
        {isScanning ? (
          <Loader2 size={13} className="animate-spin text-[#09232d]" />
        ) : (
          <Scan size={13} className="text-[#09232d]" />
        )}
        <span>{isScanning ? "Scanning…" : "Scan"}</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition-colors hover:bg-[#0f3340] cursor-pointer"
      >
        <Sparkles size={13} />
        Listen Settings
      </button>
    </div>
  );
}

function SocialOpportunityDetail({ signal }: { signal: SocialSignal }) {
  const isIndividual = signal.entityType === "individual" || signal.company.toLowerCase() === "individual";
  const [hasCopiedMessage, setHasCopiedMessage] = useState(false);
  const [expandedSignalId, setExpandedSignalId] = useState<number | null>(null);
  const showFullSignal = expandedSignalId === signal.id;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(signal.suggestedMessage);
      setHasCopiedMessage(true);
      toast.success("AI suggested message copied to clipboard!");
      window.setTimeout(() => setHasCopiedMessage(false), 2000);
    } catch {
      toast.error("Failed to copy message.");
    }
  };

  const postHref =
    signal.postUrl ||
    (signal.source === "LinkedIn Post"
      ? "https://www.linkedin.com"
      : signal.source === "X/Twitter Post"
      ? "https://x.com"
      : signal.source === "Google Search"
      ? `https://www.google.com/search?q=${encodeURIComponent(signal.signal)}`
      : "https://www.reddit.com");

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      {/* 1. Opportunity Header (FIXED) */}
      <div className="relative min-h-[175px] shrink-0 bg-[#0b242e] px-7 pb-5 pt-8 text-white">
        <div className="absolute right-7 top-8">
          <ScoreGauge score={signal.score} dark />
        </div>
        <SourceBadge sourceIcon={signal.sourceIcon} />
        <p
          className="mt-3 max-w-[250px] text-[10px] font-light leading-[13px] text-white"
          title={showFullSignal ? undefined : `Full Signal: ${signal.signal}`}
        >
          {showFullSignal ? signal.signal : (signal.summary || signal.description)}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <a
            href={postHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              toast.info(`Opening ${signal.source}…`);
            }}
            className="inline-flex items-center gap-1 text-[10px] italic text-white/90 transition-opacity hover:opacity-100 hover:text-white cursor-pointer"
          >
            <span className="underline underline-offset-2">
              {signal.source === "Google Search" ? "See Search Result" : "See Post"}
            </span>
            <span className="not-italic no-underline">→</span>
          </a>
          {signal.summary && signal.summary !== signal.signal && (
            <button
              type="button"
              onClick={() => setExpandedSignalId(showFullSignal ? null : signal.id)}
              className="text-[10px] italic text-white/70 underline underline-offset-2 transition-opacity hover:opacity-100 hover:text-white cursor-pointer"
            >
              {showFullSignal ? "Show Summary" : "Show Full"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[9px] font-light text-[#d0d0d0]">
          {signal.source} • {signal.source === "Google Search" ? "Intent Search Query" : "Public"} • 2hrs ago
        </p>
      </div>

      {/* 2. Middle Content (SCROLLABLE) */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-2 border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <div className="flex items-center gap-2 border-r border-[#e9e9e9] pr-4">
            <Image src="/avatars/male-avatar.png" alt="" width={25} height={25} className="size-[25px] rounded-full object-cover" />
            <div>
              <p className="text-[10px] font-semibold leading-[12px]">{signal.profile}</p>
              <p className="text-[10px] font-light leading-[12px]">{signal.persona}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-4">
            {isIndividual ? (
              <User size={22} className="shrink-0 text-[#616263]" />
            ) : (
              <CompanyBuildingIcon className="size-[22px] shrink-0 text-[#616263]" />
            )}
            <div>
              <p className="text-[10px] font-semibold leading-[12px]">{signal.company}</p>
              <p className="whitespace-pre-line text-[10px] font-light leading-[12px]">
                {signal.location || (isIndividual ? "Individual profile" : "Public profile")}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <p className="mb-2 text-[10px] font-semibold leading-[12px]">Why this is an opportunity</p>
          {signal.reasons.map((item) => (
            <div key={item} className="flex items-center gap-1.5 py-0.5 text-[10px] font-light leading-[12px]">
              <CircleCheck size={17} className="shrink-0 text-[#57c946]" />
              {item}
            </div>
          ))}
        </div>

        <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <p className="mb-3 text-[10px] font-semibold leading-[12px]">Intent & Context</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              ["Signal Type", signal.signalType],
              ["Buying Stage", signal.buyingStage],
              ["Problem", signal.problem],
              ["Urgency", signal.urgency],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-light leading-[12px]">{label}</p>
                <p className="text-[10px] font-semibold leading-[12px]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {(signal.industry || (signal.keyTopics && signal.keyTopics.length > 0)) && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-2 text-[10px] font-semibold leading-[12px]">Prospect Intelligence</p>
            {signal.industry && (
              <p className="mb-2 text-[10px] leading-[13px]">
                <span className="font-semibold">Industry:</span> {signal.industry}
              </p>
            )}
            {signal.keyTopics && signal.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {signal.keyTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[9px] font-medium text-[#494c4e]"
                  >
                    #{topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {signal.competitors && signal.competitors.length > 0 && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-1.5 text-[10px] font-semibold leading-[12px]">Mentioned Tools & Vendors</p>
            <div className="flex flex-wrap gap-1.5">
              {signal.competitors.map((comp) => (
                <span
                  key={comp}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[#e2e2e2] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#09232d]"
                >
                  {comp}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-[5px] px-2 py-2">
          <div className="rounded-[10px] border border-[#e8e5e5] bg-[#f7f6f6] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
            <p className="text-[10px] font-bold leading-[12px]">Recommended Action</p>
            <p className="mt-1 text-[9px] leading-[12px]">
              <span className="font-semibold">
                {signal.recommendedAction?.title || "Reach out within 24 hours"}
              </span>
              <br />
              {signal.recommendedAction?.detail || "This prospect is actively evaluating solutions."}
            </p>
          </div>
          <div className="rounded-[10px] border border-[#e8e5e5] bg-white px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold leading-[12px]">AI Suggested Message</p>
              <button
                type="button"
                aria-label="Copy AI suggested message"
                onClick={handleCopyMessage}
                className="grid size-5 place-items-center rounded-[4px] text-[#9d9d9d] transition-colors hover:bg-gray-100 hover:text-[#09232d] cursor-pointer"
              >
                {hasCopiedMessage ? (
                  <Check size={13} className="text-[#16b37d]" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
            <p className="mt-1 whitespace-pre-line text-[9px] leading-[12px]">{signal.suggestedMessage}</p>
          </div>
          {signal.followUpStrategy && (
            <div className="rounded-[10px] border border-[#e8e5e5] bg-[#fcfcfc] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
              <p className="text-[10px] font-bold leading-[12px]">Follow-up Strategy</p>
              <p className="mt-1 text-[9px] leading-[12px]">{signal.followUpStrategy}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Opportunity Footer (FIXED) */}
      <div className="mt-auto shrink-0 flex items-center gap-[17px] border-t border-[#e9e9e9] bg-[#f7f7f7] px-6 py-4">
        <button
          type="button"
          onClick={() => toast.success(`Creating outreach message for ${signal.company}…`)}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition hover:bg-[#0f3340] cursor-pointer"
        >
          Create Outreach
        </button>
        <button
          type="button"
          onClick={() => toast.success(`Reminder set for ${signal.company}.`)}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer"
        >
          Set Reminder
        </button>
        <button
          type="button"
          onClick={() => toast.success(`Added ${signal.company} to CRM pipeline.`)}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer"
        >
          Add to CRM
        </button>
      </div>
    </aside>
  );
}

function ListeningSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const sources = ["LinkedIn public index", "X/Twitter mentions", "Reddit communities", "Meta business pages"];
  const intents = ["Recommendations", "Switching", "Pricing questions", "Hiring or expansion"];

  const handleSave = () => {
    toast.success("Listening settings saved for this mock workspace.");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ type: "spring", duration: 0.32 }}
            className="relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b242e] text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Social Listening
                </p>
                <h3 className="mt-1 text-[18px] font-semibold">Listen Settings</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close listen settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Sources monitored</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sources.map((sourceName) => (
                    <label
                      key={sourceName}
                      className="flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input type="checkbox" defaultChecked className="accent-[#8dec66]" />
                      {sourceName}
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Refresh cadence</p>
                  <div className="mt-3 space-y-2 text-[12px] text-white/70">
                    {["Every 14 days", "Every 30 days"].map((cadence, index) => (
                      <label key={cadence} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="social-listening-cadence"
                          defaultChecked={index === 0}
                          className="accent-[#8dec66]"
                        />
                        {cadence}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Opportunity threshold</p>
                  <div className="mt-4">
                    <input type="range" min="40" max="90" defaultValue="70" className="w-full accent-[#8dec66]" />
                    <div className="mt-2 flex justify-between text-[11px] text-white/45">
                      <span>Broad</span>
                      <span>70% score</span>
                      <span>Strict</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Intent signals</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {intents.map((intentName) => (
                    <label
                      key={intentName}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input type="checkbox" defaultChecked className="accent-[#8dec66]" />
                      {intentName}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Routing rules</p>
                <div className="mt-3 grid gap-3 text-[12px] text-white/70 sm:grid-cols-2">
                  <label>
                    CRM destination
                    <select className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none">
                      <option>Qualified leads pipeline</option>
                      <option>Human review queue</option>
                    </select>
                  </label>
                  <label>
                    Outreach channel
                    <select className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none">
                      <option>Email first</option>
                      <option>Human follow-up</option>
                    </select>
                  </label>
                </div>
              </section>
            </div>

            <div className="flex gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-[14px] bg-white/5 text-[13px] font-semibold text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="h-11 flex-1 rounded-[14px] bg-[#8dec66] text-[13px] font-semibold text-[#09232d] transition hover:bg-[#9bff73]"
              >
                Save Settings
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SocialListeningTab() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [signalType, setSignalType] = useState("all");
  const [intent, setIntent] = useState("all");
  const [activeSignalId, setActiveSignalId] = useState(socialSignals[0].id);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [removedSignalIds, setRemovedSignalIds] = useState<number[]>([]);

  const handleRemoveSignal = (id: number) => {
    setRemovedSignalIds((prev) => [...prev, id]);
  };

  const handleScan = () => {
    setIsScanning(true);
    toast.loading("Scanning web, social channels, and public registries…", { id: "social-scan" });
    window.setTimeout(() => {
      setIsScanning(false);
      toast.success("Scan complete. 4 new social opportunities identified.", { id: "social-scan" });
    }, 1500);
  };

  const filteredSignals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return socialSignals.filter((signal) => {
      if (removedSignalIds.includes(signal.id)) return false;
      const matchesSearch =
        query.length === 0 ||
        [signal.signal, signal.source, signal.persona, signal.company, signal.intent, signal.description]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesSource = source === "all" || signal.source === source;
      const matchesSignalType = signalType === "all" || signal.signalType === signalType;
      const matchesIntent = intent === "all" || signal.buyingStage === intent;
      return matchesSearch && matchesSource && matchesSignalType && matchesIntent;
    });
  }, [intent, removedSignalIds, search, signalType, source]);

  const activeSignal =
    filteredSignals.find((signal) => signal.id === activeSignalId) ?? filteredSignals[0] ?? socialSignals[0];

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_406px] items-stretch gap-[25px] max-xl:grid-cols-1 xl:h-[700px]">
        <div className="flex h-full min-h-0 flex-col gap-[17px]">
          <div className="shrink-0 grid grid-cols-3 items-start gap-[25px] max-lg:grid-cols-2 max-sm:grid-cols-1">
            {socialStatCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={card.value}
                percent={card.percent}
                active={card.active}
                unit={card.unit}
              />
            ))}
          </div>
          <div className="shrink-0">
            <SocialListeningFilters
              search={search}
              source={source}
              signalType={signalType}
              intent={intent}
              isScanning={isScanning}
              onSearchChange={setSearch}
              onSourceChange={setSource}
              onSignalTypeChange={setSignalType}
              onIntentChange={setIntent}
              onScan={handleScan}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </div>
          <SocialSignalsTable
            signals={filteredSignals}
            activeSignalId={activeSignal.id}
            onSelectSignal={(signal) => setActiveSignalId(signal.id)}
            onRemoveSignal={handleRemoveSignal}
          />
        </div>
        <SocialOpportunityDetail signal={activeSignal} />
      </div>
      <ListeningSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}

export function SalesEngineView() {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [isIcpModalOpen, setIsIcpModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SalesEngineTab>("social-listening");
  const { data: activeProfile } = useActiveIcpProfile();
  const { data: metrics } = useSalesEngineMetrics();

  const leadsDiscovered = metrics?.leads_discovered ?? 0;
  const qualifiedLeads = metrics?.qualified_leads ?? 0;
  const formatMetric = (value: number) => value.toLocaleString();

  return (
    <div className="min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-7">
        {!chatExpanded && (
          <SalesEngineTabs
            activeTab={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setChatExpanded(false);
            }}
          />
        )}

        {activeTab === "social-listening" && !chatExpanded ? (
          <SocialListeningTab />
        ) : (
          <>
        {!chatExpanded && (
          <div className="grid grid-cols-[269px_269px_minmax(360px,1fr)_auto] items-start gap-[25px] max-xl:grid-cols-2 max-lg:grid-cols-1">
            <MetricCard title="Lead Metrics" value={formatMetric(leadsDiscovered)} percent="—" active />
            <MetricCard title="Qualified Lead Metrics" value={formatMetric(qualifiedLeads)} percent="—" />
            <TrendChart />
            <div className="flex flex-col gap-2 pt-1 max-xl:col-span-2 max-lg:col-span-1 max-lg:pt-0">
              <div className="flex items-center gap-3">
                <Link
                  href="/crm"
                  className="flex h-11 items-center gap-2.5 rounded-[14px] border border-[#d1d1d1] bg-white px-4 text-sm font-medium text-[#222222] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#bfbfbf] hover:bg-[#f8f8f8]"
                >
                  <PipelineGaugeIcon className="h-5 w-5 text-[#8a8a8a]" />
                  View CRM Pipeline
                </Link>
                <button
                  type="button"
                  onClick={() => setIsIcpModalOpen(true)}
                  className="flex h-11 items-center gap-2.5 rounded-[14px] bg-[#09232d] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0c2e3b] cursor-pointer"
                >
                  <IcpBuilderIcon className="h-5 w-5 text-white" />
                  ICP Builder
                </button>
              </div>
              {activeProfile && (
                <div className="flex items-center gap-1.5 px-1 text-[11px] text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-gray-400">Active ICP:</span>
                  <span className="font-semibold text-[#09232d] truncate max-w-[240px]">
                    {activeProfile.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={
            chatExpanded
              ? "grid grid-cols-1 gap-[25px]"
              : "grid grid-cols-[minmax(0,949px)_368px] gap-[25px] max-xl:grid-cols-1"
          }
        >
          <ChatWorkspace
            expanded={chatExpanded}
            onToggleExpanded={() => setChatExpanded((current) => !current)}
            onOpenIcpBuilder={() => setIsIcpModalOpen(true)}
          />
          {!chatExpanded && <OutreachPanel />}
        </div>
          </>
        )}
      </div>

      <IcpBuilderModal isOpen={isIcpModalOpen} onClose={() => setIsIcpModalOpen(false)} />
    </div>
  );
}

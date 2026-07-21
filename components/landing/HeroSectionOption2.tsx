"use client";

import Link from "next/link";

interface HeroSectionOption2Props {
  onDownloadAgentApp: () => void;
}

export default function HeroSectionOption2({ onDownloadAgentApp }: HeroSectionOption2Props) {
  return (
    <div className="relative w-full bg-[#0B252C] rounded-b-[28px] sm:rounded-b-[48px] lg:rounded-b-[56px] shadow-2xl flex flex-col items-center justify-center pt-6 sm:pt-8 pb-10 sm:pb-16 lg:pb-20 px-3.5 sm:px-6 lg:px-8 z-20 overflow-x-clip">
      {/* Background Ambient Glow Accents */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full bg-[#1E5A69]/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] rounded-full bg-[#82C341]/10 blur-3xl pointer-events-none" />

      {/* Main Centered Hero Content */}
      <div className="relative z-10 max-w-5xl w-full mx-auto flex flex-col items-center text-center">
        {/* Top Feature Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-md p-1 pr-3.5 sm:pr-4 mb-5 sm:mb-6 shadow-sm max-w-full overflow-hidden">
          <span className="rounded-full bg-[#82C341] px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-bold text-white tracking-wide uppercase shrink-0">
            New
          </span>
          <span className="text-[11px] sm:text-[12px] font-semibold text-white/90 tracking-wide truncate">
            Offline RealTime Tracking System
          </span>
        </div>

        {/* BOLD Centered Heading with Supervisor Tag */}
        <h1 className="text-3xl sm:text-5xl lg:text-[56px] font-extrabold text-white leading-[1.18] sm:leading-[1.15] tracking-tight max-w-4xl mb-5 sm:mb-6 px-1">
          The Ultimate{" "}
          <span className="relative inline-block bg-[#FBBF24]/20 border border-[#FBBF24]/40 text-[#FCD34D] px-2.5 sm:px-3.5 py-0.5 rounded-xl sm:rounded-2xl mx-0.5 my-0.5">
            Field Agent
            <span className="absolute -top-2.5 -right-2 sm:-top-3.5 sm:-right-3.5 bg-[#F59E0B] text-[#0B252C] text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-md shadow-md">
              Supervisor
            </span>
          </span>{" "}
          Tracking System
        </h1>

        {/* Subtitle / Description */}
        <p className="text-xs sm:text-[16px] font-light text-white text-center leading-relaxed sm:leading-normal max-w-[706px] mx-auto mb-7 sm:mb-8 px-2">
          An all-in-one field management and CRM platform built for real-world operations. Track teams, manage tasks, and capture customer interactions seamlessly, even offline.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 w-full max-w-md mb-8 sm:mb-12">
          <Link href="/register" className="w-full sm:w-auto">
            <button className="w-full sm:w-auto px-8 sm:px-10 h-12 sm:h-13 bg-white text-[#0B252C] text-sm font-extrabold rounded-full shadow-lg hover:bg-white/90 active:scale-[0.98] transition-all cursor-pointer">
              Sign Up
            </button>
          </Link>
          <button
            onClick={onDownloadAgentApp}
            className="w-full sm:w-auto px-6 sm:px-8 h-12 sm:h-13 border border-white/40 text-white text-sm font-extrabold rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            Download Agent App
          </button>
        </div>

        {/* MAP VIEW CONTAINER WITH TOP-RIGHT DOODLE SVG ILLUSTRATION */}
        <div className="relative w-full max-w-[1005px] mx-auto">
          {/* Hand-drawn SVG Doodle Illustration on Top Right of Map */}
          <svg
            width="254"
            height="233"
            viewBox="0 0 254 233"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute -top-10 -right-10 z-30 pointer-events-none opacity-90 hidden md:block"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M132.376 192.279C148.042 203.989 164.875 214.796 176.25 231.065C176.93 232.031 178.261 232.274 179.234 231.601C180.199 230.923 180.44 229.593 179.764 228.62C168.122 211.973 150.969 200.832 134.937 188.852C133.993 188.139 132.644 188.335 131.94 189.282C131.228 190.225 131.432 191.566 132.376 192.279Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M147.356 168.17C155.566 167.139 163.416 167.575 171.174 170.539C172.282 170.963 173.517 170.408 173.942 169.308C174.359 168.203 173.8 166.963 172.699 166.543C164.264 163.319 155.742 162.806 146.818 163.925C145.643 164.07 144.809 165.139 144.963 166.314C145.11 167.483 146.188 168.32 147.356 168.17Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M168.924 108.548C176.739 102.375 185.557 99.467 195.561 99.9512C196.74 100.008 197.745 99.0972 197.796 97.9153C197.854 96.7383 196.939 95.7329 195.759 95.6764C184.686 95.1428 174.918 98.3527 166.264 105.187C165.336 105.917 165.185 107.268 165.916 108.193C166.654 109.123 168.003 109.282 168.924 108.548Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M97.9332 42.1854C95.4464 42.8139 93.0117 43.6652 90.6798 44.7564C89.6409 45.2417 87.6025 46.3935 86.4238 47.7858C85.1623 49.2651 84.7538 50.9792 85.6389 52.6638C86.8156 54.8999 88.3519 55.8458 89.8837 56.0875C91.3578 56.3218 92.9649 55.8656 94.5147 54.8241C97.4758 52.8326 100.278 48.5642 101.426 45.8084C103.931 45.3469 106.477 45.1234 109.028 45.1294C128.03 45.1745 144.239 61.6554 149.013 85.1706C150.682 93.4024 146.099 104.942 139.812 116.438C130.025 134.34 115.805 151.997 111.81 157.292C110.827 158.602 110.39 159.483 110.347 159.691C110.123 160.703 110.559 161.317 110.91 161.682C111.423 162.203 111.97 162.425 112.486 162.497C113.186 162.592 113.941 162.419 114.653 161.831C115.043 161.503 115.469 160.964 115.878 160.358C116.158 159.935 116.395 159.423 116.69 159.186C118.584 157.676 120.557 156.289 122.527 154.88C129.131 150.129 136.083 146.221 143.338 142.537C166.389 130.832 189.869 117.843 216.023 115.031C217.196 114.904 218.05 113.851 217.919 112.674C217.794 111.503 216.737 110.653 215.556 110.775C188.881 113.64 164.901 126.785 141.392 138.721C135.221 141.854 129.263 145.149 123.545 148.962C130.326 139.849 139.355 126.981 145.714 114.437C151.37 103.281 154.831 92.3293 153.208 84.3272C147.979 58.567 129.841 40.8953 109.03 40.8502C106.803 40.8462 104.572 40.9965 102.37 41.3139C104.402 23.1084 92.6085 6.85198 74.4614 3.35434C73.2971 3.12822 72.1775 3.88987 71.9539 5.04797C71.7373 6.21103 72.4969 7.3322 73.6613 7.55832C90.0138 10.7104 100.455 25.688 97.9332 42.1854ZM95.8401 47.2765C94.7073 47.672 93.5955 48.1265 92.4989 48.6338C91.9144 48.9088 90.8403 49.4731 90.0383 50.2022C89.8526 50.3746 89.6207 50.6862 89.5167 50.8327C89.8304 51.4124 90.1264 51.7948 90.5433 51.8592C91.0624 51.9427 91.5752 51.6355 92.1182 51.271C93.4822 50.3578 94.8142 48.8089 95.8401 47.2765Z"
              fill="white"
            />
          </svg>

          {/* Map Video Card */}
          <div className="relative w-full h-[260px] xs:h-[320px] sm:h-[460px] lg:h-[597px] rounded-2xl sm:rounded-[32px] overflow-hidden shadow-2xl z-10 bg-[#0B252C]">
            <video
              src="/assets/GIFs/fac23landingpageHero.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover rounded-2xl sm:rounded-[32px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

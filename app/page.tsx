"use client";

import { useState } from "react";
import { DownloadAgentAppModal } from "@/components/pwa/DownloadAgentAppModal";
import { getAgentInstallUrl, isMobileDevice } from "@/lib/agent-pwa-url";
import Footer from "@/components/layout/footer";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import AboutSection from "@/components/landing/AboutSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";

export default function Home() {
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  function handleDownloadAgentApp() {
    if (isMobileDevice()) {
      window.location.href = getAgentInstallUrl();
      return;
    }
    setAgentModalOpen(true);
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-white font-sans overflow-x-hidden">
      {/* Top Header & Navbar wrapper */}
      <div className="w-full bg-white px-6 sm:px-10 lg:px-16 pt-6 sm:pt-8 lg:pt-10">
        <div className="flex w-full items-center justify-between">
          {/* Vertical spacer match for split column offset */}
          <div className="w-12 hidden lg:block shrink-0" />
          <div className="flex-1">
            <LandingNavbar />
          </div>
        </div>
      </div>

      {/* Split-screen Layout Hero section */}
      <div className="flex-grow w-full flex flex-col bg-white">
        <div className="flex-grow w-full flex flex-col lg:flex-row bg-white">
          <div className="w-12 bg-[#0B252C] shrink-0 hidden lg:block" />
          <HeroSection onDownloadAgentApp={handleDownloadAgentApp} />
        </div>
      </div>

      {/* About / app purpose */}
      <AboutSection />

      {/* Features & Stats grid */}
      <FeaturesSection />

      {/* Pricing packages matrix */}
      <PricingSection />
      
      {/* Testimonials Quotes carousel */}
      <TestimonialsSection />


      {/* Footer */}
      <div id="p23-africa">
        <Footer />
      </div>

      {/* Download app trigger modal */}
      <DownloadAgentAppModal
        isOpen={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
      />
    </div>
  );
}

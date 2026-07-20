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
      {/* Top Header & Navbar */}
      <LandingNavbar />

      {/* Split-screen Layout Hero section */}
      <div className="flex-grow w-full flex flex-col bg-white">
        <HeroSection onDownloadAgentApp={handleDownloadAgentApp} />
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

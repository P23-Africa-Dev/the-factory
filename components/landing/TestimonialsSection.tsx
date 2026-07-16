"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

const testimonials = [
  {
    quote: "I've been consistently impressed with the quality of service provided by Factory 23. It have exceeded my expectations and delivered exceptional results. Highly recommended!",
    name: "John D.",
    role: "Company CEO",
    avatar: "/avatars/john_avatar.png",
    bgColor: "bg-[#FDF2FB]",
    borderColor: "border-[#FAD8F7]",
  },
  {
    quote: "I've been consistently impressed with the quality of service provided by Factory 23. It have exceeded my expectations and delivered exceptional results. Highly recommended!",
    name: "Touka F.",
    role: "Company CEO",
    avatar: "/avatars/touka_avatar.png",
    bgColor: "bg-white",
    borderColor: "border-gray-100",
    shadow: "shadow-lg shadow-gray-100/50",
  },
  {
    quote: "I've been consistently impressed with the quality of service provided by Factory 23. It have exceeded my expectations and delivered exceptional results. Highly recommended!",
    name: "Donald N.",
    role: "Company CEO",
    avatar: "/avatars/donald_avatar.png",
    bgColor: "bg-[#F0FDF8]",
    borderColor: "border-[#D1F7E2]",
  },
  {
    quote: "Implementing the Factory 23 field tracking system transformed our dispatch operations. Real-time updates and offline synchronization are absolute game-changers.",
    name: "Sarah M.",
    role: "Operations Director",
    avatar: "/avatars/female-avatar.png",
    bgColor: "bg-[#FDF2FB]",
    borderColor: "border-[#FAD8F7]",
  },
  {
    quote: "We tried several platforms before, but none offered the offline reliability of Factory 23. Our field agents love the app's simplicity and speed.",
    name: "David K.",
    role: "Logistics Manager",
    avatar: "/avatars/male-avatar.png",
    bgColor: "bg-white",
    borderColor: "border-gray-100",
    shadow: "shadow-lg shadow-gray-100/50",
  },
  {
    quote: "The customer service and custom workflows allowed us to integrate our existing database smoothly. Highly recommend for any enterprise with field teams.",
    name: "Elena R.",
    role: "Product Head",
    avatar: "/avatars/female-avatar.png",
    bgColor: "bg-[#F0FDF8]",
    borderColor: "border-[#D1F7E2]",
  }
];

export default function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNext = () => {
    if (isDesktop) {
      setCurrentIndex((prev) => (prev === 0 ? 3 : 0));
    } else {
      setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
    }
  };

  const handlePrev = () => {
    if (isDesktop) {
      setCurrentIndex((prev) => (prev === 0 ? 3 : 0));
    } else {
      setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
    }
  };

  const handleDotClick = (idx: number) => {
    if (isDesktop) {
      setCurrentIndex(idx * 3);
    } else {
      setCurrentIndex(idx);
    }
  };

  const translatePercent = isDesktop ? Math.floor(currentIndex / 3) * 100 : currentIndex * 100;
  const totalDots = isDesktop ? 2 : testimonials.length;

  return (
    <section id="reviews" className="w-full bg-[#F8FAFC] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans relative overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col items-center">
        
        {/* Header */}
        <div className="text-center max-w-3xl mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-[#0B252C] tracking-tight">
            What Our Client Say About Us
          </h2>
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mt-4">
            Discover the experiences of our satisfied customers! Read their testimonials to learn how our services have made a positive impact on their businesses.
          </p>
        </div>

        {/* Carousel Viewport Container */}
        <div className="w-full relative flex items-center gap-4 sm:gap-6">
          {/* Left Navigation Button */}
          <button
            onClick={handlePrev}
            aria-label="Previous testimonial"
            className="absolute left-[-16px] lg:left-[-24px] z-20 w-12 h-12 rounded-full bg-white flex items-center justify-center border border-gray-100 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-[#0B252C] stroke-[2.5]" />
          </button>

          {/* Carousel Inner Container */}
          <div className="w-full overflow-hidden px-2 py-4">
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${translatePercent}%)` }}
            >
              {testimonials.map((item, idx) => (
                <div
                  key={idx}
                  className="w-full lg:w-1/3 shrink-0 px-3 sm:px-4 flex"
                >
                  <div
                    className={`w-full rounded-2xl border p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-md ${item.bgColor} ${item.borderColor} ${item.shadow || ""}`}
                  >
                    <p className="text-[15px] sm:text-base text-[#4A5F64] leading-relaxed italic mb-8">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-100">
                        <Image
                          src={item.avatar}
                          alt={item.name}
                          width={48}
                          height={48}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-[#0B252C]">
                          {item.name}
                        </h4>
                        <p className="text-xs text-[#4A5F64] font-medium">
                          {item.role}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Navigation Button */}
          <button
            onClick={handleNext}
            aria-label="Next testimonial"
            className="absolute right-[-16px] lg:right-[-24px] z-20 w-12 h-12 rounded-full bg-white flex items-center justify-center border border-gray-100 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 text-[#0B252C] stroke-[2.5]" />
          </button>
        </div>

        {/* Indicator Dots */}
        <div className="flex items-center gap-2.5 mt-10">
          {Array.from({ length: totalDots }).map((_, idx) => {
            const isActive = isDesktop
              ? Math.floor(currentIndex / 3) === idx
              : currentIndex === idx;
            return (
              <button
                key={idx}
                onClick={() => handleDotClick(idx)}
                aria-label={`Go to slide page ${idx + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  isActive ? "w-6 bg-[#0B252C]" : "w-2.5 bg-[#0B252C]/30 hover:bg-[#0B252C]/50"
                }`}
              />
            );
          })}
        </div>

      </div>
    </section>
  );
}

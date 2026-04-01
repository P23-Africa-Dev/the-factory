import Image from "next/image";
import Logo from "@/assets/images/logo.png";
import Icon3d from "@/assets/images/3d-image.png";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col md:flex-row min-h-screen md:h-screen w-screen overflow-y-auto md:overflow-hidden bg-[#6FA8A6]"
      style={{
        backgroundImage: `
          repeating-linear-gradient(to right, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px),
          repeating-linear-gradient(to bottom, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px)
        `,
      }}
    >
      {/* Mobile top wave */}
      <div className="md:hidden h-[280px] shrink-0 relative">
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 390 200" fill="none" preserveAspectRatio="none" className="w-full h-[200px] block">
            <path d="M0 200 L0 15 C80 0 160 140 250 150 C310 156 360 120 390 110 L390 200 Z" fill="white" />
          </svg>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div
        className="relative max-w-[523px] w-[40%] shrink-0 hidden md:flex flex-col px-[101px] pt-[132px]"
      >
        <Image
          src={Logo}
          alt="Factory 23 Logo"
          width={48}
          height={48}
        />

        <h1 className="text-[40px] font-bold text-white leading-[83px]">
          Factory 23
        </h1>
        <p className="text-white text-[15px] leading-[16px] max-w-[240px]">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod
        </p>

        <Image
          src={Icon3d}
          alt="3D Objects"
          width={532}
          height={531}
          className="w-[532px] h-[531px] object-contain object-bottom absolute bottom-0 left-[240px] z-10"
        />
      </div>

      <div className="flex-1 bg-white md:min-w-[595px] md:shadow-[0px_2px_6px_2px_#00000026,0px_1px_2px_0px_#0000004D] md:rounded-l-[72px] flex items-start md:items-center justify-center py-8 md:py-12 px-6 md:px-0 md:pl-[210px] md:overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

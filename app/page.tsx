import Image from "next/image";
import Link from "next/link";
import Logo from "@/assets/images/logo.png";
import Icon3d from "@/assets/images/3d-image.png";
import Button from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#6FA8A6] overflow-x-hidden"
      style={{
        backgroundImage: `
          repeating-linear-gradient(to right, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px),
          repeating-linear-gradient(to bottom, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px)
        `,
      }}
    >
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 md:px-12 lg:px-[101px] py-10 z-20">
        <div className="flex items-center gap-3">
          <Image
            src={Logo}
            alt="Factory 23 Logo"
            width={48}
            height={48}
            className="w-12 h-12 object-contain shadow-sm"
          />
          <h1 className="text-white text-2xl lg:text-3xl font-bold tracking-tight">Factory 23</h1>
        </div>
        
        <div className="hidden md:flex items-center gap-8">
          <Link href="/login" className="text-white font-semibold text-sm hover:opacity-80 transition-opacity">
            Login
          </Link>
          <Link href="/register">
            <Button variant="outline" className="w-auto px-10 h-11 bg-white border-transparent text-[#6FA8A6] hover:bg-white/90 font-bold">
              Sign Up
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 md:px-12 lg:px-[101px] py-16 relative z-10">
        <div className="w-full flex flex-col gap-8 md:gap-12 text-center mx-auto max-w-[900px]">
          <div className="flex flex-col gap-6">
            <h2 className="text-5xl md:text-7xl lg:text-[90px] font-extrabold text-white leading-[1.1] tracking-[-2px]">
              Modern 
              <span className="text-[#34373C]"> Factory </span>
              Systems
            </h2>
            
            <p className="text-white text-base md:text-lg lg:text-xl leading-relaxed font-medium opacity-90 mx-auto max-w-2xl text-center">
              Transform your production floor with enterprise-grade tracking,
              real-time logistics and automated workflows.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-4">
            <Link href="/register" className="w-full sm:w-auto">
              <Button className="w-full sm:w-[220px] h-[58px] text-sm font-bold bg-[#34373C] hover:bg-[#2a2d31] shadow-2xl transition-all hover:scale-105 active:scale-95">
                Create Account
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-[220px] h-[58px] text-sm font-bold bg-white/10 border-white/40 text-white hover:bg-white/20 backdrop-blur-md transition-all hover:scale-105 active:scale-95">
                Login
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Subtle Background Elements */}
      <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-black/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Footer Text */}
      <footer className="px-6 md:px-12 lg:px-[101px] py-10 z-20 text-white/40 text-xs md:text-sm font-medium tracking-wide flex justify-between items-center bg-black/5">
        <span>© 2024 Factory 23</span>
        <div className="flex gap-8">
           <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
           <Link href="#" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}

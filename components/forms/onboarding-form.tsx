"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { useState } from "react";

export default function OnboardingForm() {
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");
  const [role, setRole] = useState("");

  return (
    <div className="flex flex-col">
      <h3 className="text-center text-[#34373C] font-bold text-sm sm:text-[15px] mb-6 mt-[-10px] md:mt-[-16px]">
        Create a Workspace
      </h3>

      <Input type="text" placeholder="Company Name" className="mb-6" />
      <Input type="text" placeholder="Country" className="mb-6" />
      
      <div className="mb-6">
        <Select 
          value={teamSize} 
          onChange={(e) => setTeamSize(e.target.value)} 
          placeholder="Team Size" 
          options={[
            { label: "1-10", value: "1-10" },
            { label: "11-50", value: "11-50" },
            { label: "51-200", value: "51-200" },
            { label: "201+", value: "201+" },
          ]} 
        />
      </div>

      <div className="mb-6">
        <Select 
          value={useCase} 
          onChange={(e) => setUseCase(e.target.value)} 
          placeholder="What are you using this tool for?" 
          options={[
            { label: "Personal Project", value: "personal" },
            { label: "Business Operations", value: "business" },
            { label: "Client Work", value: "client" },
            { label: "Other", value: "other" },
          ]} 
        />
      </div>

      <div className="mb-14">
        <Select 
          value={role} 
          onChange={(e) => setRole(e.target.value)} 
          placeholder="What best describes you" 
          options={[
            { label: "Founder / Executive", value: "founder" },
            { label: "Manager", value: "manager" },
            { label: "Developer", value: "developer" },
            { label: "Designer", value: "designer" },
          ]} 
        />
      </div>

      <Button>Continue</Button>
    </div>
  );
}

import { TinyButton } from "../ui/tiny-button";

export const DashboardMap = () => {
  return (
    <div className="mt-26.5 min-w-lg flex flex-col h-min">
      <div className="flex items-center justify-between px-4.75 mb-4">
        <h3 className="text-[#203B5F] font-medium text-[16px] ">
          Active Field Agents
        </h3>
        <TinyButton>Open Map</TinyButton>
      </div>
      <div className="w-full h-72 shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026] rounded-[20px] flex items-center justify-center bg-[#F0F0F0]">
        Sales Map Placeholder
      </div>
    </div>
  );
};

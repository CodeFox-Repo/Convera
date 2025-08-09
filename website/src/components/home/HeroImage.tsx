import React from "react";

const HeroImage: React.FC = () => {
  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-lg md:h-[480px] lg:h-[520px] xl:h-[540px]">
      <img 
        src="/images/demo.jpg" 
        alt="Foxychat Demo" 
        className="h-full w-full object-contain"
      />
    </div>
  );
};

export default HeroImage;

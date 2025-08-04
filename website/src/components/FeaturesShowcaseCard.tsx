import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface FeaturesShowcaseCardProps {
  title: string;
  description: string;
  imageUrl: string;
}

const FeaturesShowcaseCard = ({ title, description, imageUrl }: FeaturesShowcaseCardProps) => {
  return (
    <Card className="flex h-[30rem] flex-col overflow-hidden rounded-2xl border-orange-800/30 bg-black/80 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/20">
      <CardHeader className="p-0">
        <div className="h-80 w-full overflow-hidden">
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center p-5">
        <h3 className="text-xl font-bold tracking-tight text-orange-200">{title}</h3>
        <p className="text-orange-300/70 mt-2 text-base leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
};

export default FeaturesShowcaseCard;

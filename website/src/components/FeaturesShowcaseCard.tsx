import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FeaturesShowcaseCardProps {
  title: string;
  description: string;
  imageUrl: string;
}

const FeaturesShowcaseCard = ({ title, description, imageUrl }: FeaturesShowcaseCardProps) => {
  return (
    <Card className="overflow-hidden rounded-2xl shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl bg-white/60 backdrop-blur-sm border-gray-200/50 flex flex-col h-full">
      <CardHeader className="p-0">
        <div className="w-full h-48 overflow-hidden">
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        </div>
      </CardHeader>
      <CardContent className="p-5 mt-auto">
        <h3 className="text-xl font-bold tracking-tight text-gray-800">{title}</h3>
        <p className="text-muted-foreground mt-2 text-base leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
};

export default FeaturesShowcaseCard;

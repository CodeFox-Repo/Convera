import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FeaturesShowcaseCardProps {
  title: string;
  description: string;
  imageUrl: string;
}

const FeaturesShowcaseCard = ({ title, description, imageUrl }: FeaturesShowcaseCardProps) => {
  return (
    <Card className="overflow-hidden shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-6 text-base leading-relaxed">{description}</p>
        <div className="aspect-video w-full overflow-hidden rounded-lg border">
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        </div>
      </CardContent>
    </Card>
  );
};

export default FeaturesShowcaseCard;

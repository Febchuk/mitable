import { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  description?: string;
  children?: ReactNode;
}

export default function MetricCard({ label, value, description, children }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{label}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>

      <CardContent>
        {children ? children : <div className="text-4xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

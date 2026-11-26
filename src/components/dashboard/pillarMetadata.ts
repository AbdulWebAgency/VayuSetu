import { Bus, Home, Leaf } from "lucide-react";
import type { Pillar } from "@/types/airQuality";

export const PILLARS: Record<Pillar, { title: string; Icon: typeof Bus }> = {
  routines: { title: "Low-emission daily routines", Icon: Bus },
  indoor: { title: "Indoor air-quality guidance", Icon: Home },
  sustainable: { title: "Sustainable alternatives & impact", Icon: Leaf },
};

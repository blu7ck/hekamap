import { LucideIcon } from 'lucide-react';

export interface ServiceItem {
  id: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface StatItem {
  id: number;
  value: string;
  label: string;
}

export interface NavLink {
  label: string;
  href: string;
}
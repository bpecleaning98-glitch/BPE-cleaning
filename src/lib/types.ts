/** Shapes shared by the admin cabinet, the API routes and the blog pages. */

export type Post = {
  id: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_url: string | null;
  cover_alt: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  author: string;
  published: boolean;
};

export type LinkCampaign = {
  id: string;
  created_at: string;
  code: string;
  label: string;
  destination: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  note: string;
  expires_at: string | null;
  active: boolean;
};

export type LeadStatus = 'new' | 'contacted' | 'booked' | 'closed';

export type Lead = {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string | null;
  service: string | null;
  size: string | null;
  preferred_date: string | null;
  area: string | null;
  notes: string | null;
  status: LeadStatus;
  admin_note: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  link_code: string | null;
  referrer_host: string | null;
  landing_path: string | null;
  session_id: string | null;
};

/* The six stats_* functions in supabase/schema.sql, one type each. */

export type StatsOverview = {
  visitors: number;
  sessions: number;
  views: number;
  avg_seconds: number;
  leads: number;
  link_clicks: number;
};

export type StatsDaily = {
  day: string;
  visitors: number;
  sessions: number;
  views: number;
  leads: number;
};

export type StatsSource = { source: string; sessions: number; views: number; leads: number };
export type StatsPage = { path: string; views: number; avg_seconds: number };
export type StatsDevice = { device: string; sessions: number };
export type StatsPlace = { country: string; city: string; sessions: number };
export type StatsLink = {
  code: string;
  label: string;
  clicks: number;
  leads: number;
  active: boolean;
  expires_at: string | null;
};

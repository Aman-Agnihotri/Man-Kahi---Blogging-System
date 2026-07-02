export interface OverallStats {
  views: number;
  uniqueViews: number;
  reads: number;
  linkClicks: number;
  avgReadProgress: number;
  avgEngagement: number;
  trackedBlogs: number;
}

export interface DashboardStats {
  totalBlogs: number;
  totalUsers: number;
  analytics: OverallStats;
}

export interface ApiError {
  message: string;
  details?: string;
  errors?: Array<{ field: string; message: string }>;
  status?: number;
}

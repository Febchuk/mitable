import { User } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      organizationId?: string;
      correlationId?: string;
      userRole?: string;
      isManager?: boolean;
      _visibleUserIds?: string[];
    }
  }
}

export {};

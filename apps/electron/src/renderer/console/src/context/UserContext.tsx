import { createContext, useContext, useState, ReactNode } from "react";
import type { User } from "../types";

interface UserContextType {
  user: User | null;
  updateUser: (user: User) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  // Read role from environment variable, default to "employee"
  const userRole = (import.meta.env.VITE_USER_ROLE as "admin" | "employee") || "employee";

  const [user, setUser] = useState<User | null>({
    name: "Steve",
    firstName: "Steve",
    currentWeek: 1,
    role: userRole,
  });

  const updateUser = (newUser: User) => {
    setUser(newUser);
  };

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

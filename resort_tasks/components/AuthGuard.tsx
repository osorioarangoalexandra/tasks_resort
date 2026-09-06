"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AppRole = "admin" | "editor" | "viewer";

type AppModule =
  | "tasks"
  | "housekeeping"
  | "recurring"
  | "stock";

type Permission = {
  module: AppModule;
  can_view: boolean;
  can_edit: boolean;
};

type AuthContextValue = {
  user: User | null;
  userName: string | null;
  role: AppRole | null;
  permissions: Permission[];
  canView: (module: AppModule) => boolean;
  canEdit: (module: AppModule) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthGuardProps = {
  children: ReactNode;
};

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthGuard");
  }

  return context;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAccess = async () => {
      setIsChecking(true);
      setHasAccess(false);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (!currentUser) {
        setUser(null);
        setUserName(null);
        setRole(null);
        setPermissions([]);

        if (pathname !== "/login") {
          router.replace("/login");
          return;
        }

        setHasAccess(true);
        setIsChecking(false);
        return;
      }

      if (pathname === "/login") {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", currentUser.id)
        .single();

      if (!isMounted) return;

      if (profileError || !profile) {
        console.error("Could not load user profile:", profileError);
        setIsChecking(false);
        return;
      }

      const { data: modulePermissions, error: permissionsError } =
        await supabase
          .from("user_module_permissions")
          .select("module, can_view, can_edit")
          .eq("user_id", currentUser.id);

      if (!isMounted) return;

      if (permissionsError) {
        console.error(
          "Could not load user permissions:",
          permissionsError,
        );
        setIsChecking(false);
        return;
      }

      const currentRole = profile.role as AppRole;
      const currentPermissions = (modulePermissions ?? []) as Permission[];

      setUser(currentUser);
      setUserName(profile.full_name);
      setRole(currentRole);
      setPermissions(currentPermissions);

      if (currentRole === "admin") {
        setHasAccess(true);
        setIsChecking(false);
        return;
      }

      let requiredModule: AppModule | null = null;

      if (pathname === "/") {
        requiredModule = "tasks";
      } else if (pathname.startsWith("/housekeeping")) {
        requiredModule = "housekeeping";
      } else if (pathname.startsWith("/recurring")) {
        requiredModule = "recurring";
      } else if (pathname.startsWith("/stock")) {
        requiredModule = "stock";
      }

      if (!requiredModule) {
        setHasAccess(true);
        setIsChecking(false);
        return;
      }

      const permission = currentPermissions.find(
        (item) => item.module === requiredModule && item.can_view,
      );

      if (permission) {
        setHasAccess(true);
        setIsChecking(false);
        return;
      }

      const firstAllowedModule = currentPermissions.find(
        (item) => item.can_view,
      )?.module;

      if (firstAllowedModule === "housekeeping") {
        router.replace("/housekeeping");
        return;
      }

      if (firstAllowedModule === "recurring") {
        router.replace("/recurring");
        return;
      }

      if (firstAllowedModule === "tasks") {
        router.replace("/");
        return;
      }

      if (firstAllowedModule === "stock") {
        router.replace("/stock");
        return;
      }

      console.error("This user has no assigned modules.");
      setIsChecking(false);
    };

    checkAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setUserName(null);
        setRole(null);
        setPermissions([]);
        setHasAccess(false);
        setIsChecking(true);
        router.replace("/login");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const canView = (module: AppModule) => {
    if (role === "admin") return true;

    return permissions.some(
      (permission) =>
        permission.module === module && permission.can_view,
    );
  };

  const canEdit = (module: AppModule) => {
    if (role === "admin") return true;
    if (role === "viewer") return false;

    return permissions.some(
      (permission) =>
        permission.module === module &&
        permission.can_view &&
        permission.can_edit,
    );
  };

  if (isChecking || !hasAccess) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-100">
        <p className="text-sm font-medium text-slate-600">
          Checking access...
        </p>
      </main>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userName,
        role,
        permissions,
        canView,
        canEdit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

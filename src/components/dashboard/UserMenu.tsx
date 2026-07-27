import React from "react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { UserCog, Settings, FileSpreadsheet, UserPlus, Sun, Moon, Monitor, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/AuthContext";
import { auth } from "@/api/auth";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export default function UserMenu() {
  const { user, can } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
            {initials(user.full_name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="text-sm font-medium text-foreground">{user.full_name}</p>
          <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings/user"><UserCog className="w-4 h-4" /> User settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings"><Settings className="w-4 h-4" /> General settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/data/import"><FileSpreadsheet className="w-4 h-4" /> Import Workbooks</Link>
        </DropdownMenuItem>
        {can("Invite", "read") && (
          <DropdownMenuItem asChild>
            <Link to="/settings/invites"><UserPlus className="w-4 h-4" /> Invites</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 flex items-center gap-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              title={label}
              aria-label={label}
              className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${
                theme === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => auth.logout("/")}>
          <LogOut className="w-4 h-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
